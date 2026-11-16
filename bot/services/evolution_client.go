package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
)

// WhatsApp send retry policy. Transient gateway/5xx/network failures should
// not silently drop OTPs or order notifications. Configurable via env so
// operators can tune for their Evolution GO deployment.
func waSendMaxRetries() int {
	if v, err := strconv.Atoi(os.Getenv("WHATSAPP_SEND_MAX_RETRIES")); err == nil && v >= 0 && v <= 10 {
		return v
	}
	return 3
}
func waSendRetryBase() time.Duration {
	if v, err := strconv.Atoi(os.Getenv("WHATSAPP_SEND_RETRY_BASE_MS")); err == nil && v >= 50 && v <= 10000 {
		return time.Duration(v) * time.Millisecond
	}
	return 300 * time.Millisecond
}

type EvolutionClient struct {
	baseURL       string
	apiKey        string
	instanceToken string
	instance      string
	httpClient    *http.Client
}

func NewEvolutionClient(cfg *config.Config) *EvolutionClient {
	return &EvolutionClient{
		baseURL:       cfg.EvolutionAPIURL,
		apiKey:        cfg.EvolutionAPIKey,
		instanceToken: cfg.EvolutionInstanceToken,
		instance:      cfg.EvolutionInstance,
		httpClient:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *EvolutionClient) sendRequest(method, endpoint string, payload interface{}, useInstanceToken bool) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s%s", c.baseURL, endpoint)

	var body []byte
	var err error
	if payload != nil {
		body, err = json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal payload: %w", err)
		}
	}

	apiKey := c.apiKey
	if useInstanceToken && c.instanceToken != "" {
		apiKey = c.instanceToken
	}

	// Bounded retry with exponential backoff + jitter for transient failures.
	// A duplicate message is preferable to a dropped OTP / order alert.
	maxRetries := waSendMaxRetries()
	base := waSendRetryBase()
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		req, err := http.NewRequest(method, url, bytes.NewBuffer(body))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("apikey", apiKey)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("request failed: %w", err)
		} else {
			respBody, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				lastErr = fmt.Errorf("failed to read response: %w", readErr)
			} else {
				status := resp.StatusCode
				if status >= 200 && status < 300 {
					var result map[string]interface{}
					if err := json.Unmarshal(respBody, &result); err != nil {
						// Success with a non-JSON body is fine for some endpoints.
						return map[string]interface{}{}, nil
					}
					return result, nil
				}
				var result map[string]interface{}
				_ = json.Unmarshal(respBody, &result)
				lastErr = fmt.Errorf("API error (status %d): %v", status, result)
				// Retry only transient statuses: 429 and 5xx. 4xx (bad payload,
				// invalid number) will never succeed on retry.
				if status != http.StatusTooManyRequests && status < 500 {
					return nil, lastErr
				}
			}
		}
		if attempt < maxRetries {
			// Exponential backoff with full jitter.
			delay := time.Duration(float64(base) * math.Pow(2, float64(attempt)))
			jitter := time.Duration(float64(delay) * (0.5 + 0.5*float64(time.Now().UnixNano()%1000)/1000))
			time.Sleep(jitter)
		}
	}
	return nil, lastErr
}

type TextMessagePayload struct {
	Number       string        `json:"number"`
	Text         string        `json:"text"`
	Delay        int32         `json:"delay,omitempty"`
	MentionedJID []string      `json:"mentionedJid,omitempty"`
	MentionAll   bool          `json:"mentionAll,omitempty"`
	Quoted       *QuotedStruct `json:"quoted,omitempty"`
}

type QuotedStruct struct {
	MessageID   string `json:"messageId"`
	Participant string `json:"participant"`
}

func (c *EvolutionClient) SendText(number, text string) error {
	payload := TextMessagePayload{
		Number: number,
		Text:   text,
	}
	_, err := c.sendRequest("POST", "/send/text", payload, true)
	return err
}

type ButtonMessagePayload struct {
	Number       string        `json:"number"`
	Title        string        `json:"title"`
	Description  string        `json:"description"`
	Footer       string        `json:"footer"`
	Buttons      []Button      `json:"buttons"`
	Delay        int32         `json:"delay,omitempty"`
	ImageUrl     string        `json:"imageUrl,omitempty"`
	VideoUrl     string        `json:"videoUrl,omitempty"`
	MentionedJID []string      `json:"mentionedJid,omitempty"`
	MentionAll   bool          `json:"mentionAll,omitempty"`
	Quoted       *QuotedStruct `json:"quoted,omitempty"`
}

type Button struct {
	Type        string `json:"type"`
	DisplayText string `json:"displayText"`
	ID          string `json:"id,omitempty"`
	CopyCode    string `json:"copyCode,omitempty"`
	URL         string `json:"url,omitempty"`
	PhoneNumber string `json:"phoneNumber,omitempty"`
	Currency    string `json:"currency,omitempty"`
	Name        string `json:"name,omitempty"`
	KeyType     string `json:"keyType,omitempty"`
	Key         string `json:"key,omitempty"`
}

func (c *EvolutionClient) SendButton(number, title, description, footer string, buttons []Button) error {
	return c.SendButtonWithImage(number, title, description, footer, "", buttons)
}

func (c *EvolutionClient) SendButtonWithImage(number, title, description, footer, imageURL string, buttons []Button) error {
	payload := ButtonMessagePayload{
		Number:      number,
		Title:       title,
		Description: description,
		Footer:      footer,
		Buttons:     buttons,
		ImageUrl:    imageURL,
	}
	_, err := c.sendRequest("POST", "/send/button", payload, true)
	return err
}

type ListMessagePayload struct {
	Number       string        `json:"number"`
	Title        string        `json:"title"`
	Description  string        `json:"description"`
	ButtonText   string        `json:"buttonText"`
	FooterText   string        `json:"footerText"`
	Sections     []Section     `json:"sections"`
	Delay        int32         `json:"delay,omitempty"`
	MentionedJID []string      `json:"mentionedJid,omitempty"`
	MentionAll   bool          `json:"mentionAll,omitempty"`
	Quoted       *QuotedStruct `json:"quoted,omitempty"`
}

type Section struct {
	Title string `json:"title,omitempty"`
	Rows  []Row  `json:"rows"`
}

type Row struct {
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	RowID       string `json:"rowId,omitempty"`
}

func (c *EvolutionClient) SendList(number, title, description, buttonText, footerText string, sections []Section) error {
	payload := ListMessagePayload{
		Number:      number,
		Title:       title,
		Description: description,
		ButtonText:  buttonText,
		FooterText:  footerText,
		Sections:    sections,
	}
	_, err := c.sendRequest("POST", "/send/list", payload, true)
	return err
}

type CarouselMessagePayload struct {
	Number    string         `json:"number"`
	Body      string         `json:"body,omitempty"`
	Footer    string         `json:"footer,omitempty"`
	Cards     []CarouselCard `json:"cards"`
	Delay     int32          `json:"delay,omitempty"`
	FormatJid *bool          `json:"formatJid,omitempty"`
	Quoted    *QuotedStruct  `json:"quoted,omitempty"`
}

type CarouselCard struct {
	Header  CarouselCardHeader `json:"header"`
	Body    CarouselCardBody   `json:"body"`
	Footer  string             `json:"footer,omitempty"`
	Buttons []CarouselButton   `json:"buttons,omitempty"`
}

type CarouselCardHeader struct {
	Title    string `json:"title,omitempty"`
	Subtitle string `json:"subtitle,omitempty"`
	ImageUrl string `json:"imageUrl,omitempty"`
	VideoUrl string `json:"videoUrl,omitempty"`
}

type CarouselCardBody struct {
	Text string `json:"text"`
}

type CarouselButton struct {
	Type        string `json:"type"`
	DisplayText string `json:"displayText"`
	ID          string `json:"id,omitempty"`
	CopyCode    string `json:"copyCode,omitempty"`
}

func (c *EvolutionClient) SendCarousel(number string, cards []CarouselCard, body, footer string) error {
	payload := CarouselMessagePayload{
		Number: number,
		Body:   body,
		Footer: footer,
		Cards:  cards,
	}
	_, err := c.sendRequest("POST", "/send/carousel", payload, true)
	return err
}

type MediaMessagePayload struct {
	Number       string        `json:"number"`
	Url          string        `json:"url"`
	Type         string        `json:"type"`
	Caption      string        `json:"caption,omitempty"`
	Filename     string        `json:"filename,omitempty"`
	Delay        int32         `json:"delay,omitempty"`
	MentionedJID []string      `json:"mentionedJid,omitempty"`
	MentionAll   bool          `json:"mentionAll,omitempty"`
	Quoted       *QuotedStruct `json:"quoted,omitempty"`
}

func (c *EvolutionClient) SendMedia(number, url, mediaType, caption string) error {
	payload := MediaMessagePayload{
		Number:  number,
		Url:     url,
		Type:    mediaType,
		Caption: caption,
	}
	_, err := c.sendRequest("POST", "/send/media", payload, true)
	return err
}

type LocationMessagePayload struct {
	Number       string        `json:"number"`
	Name         string        `json:"name"`
	Address      string        `json:"address"`
	Latitude     float64       `json:"latitude"`
	Longitude    float64       `json:"longitude"`
	Delay        int32         `json:"delay,omitempty"`
	MentionedJID []string      `json:"mentionedJid,omitempty"`
	MentionAll   bool          `json:"mentionAll,omitempty"`
	Quoted       *QuotedStruct `json:"quoted,omitempty"`
}

func (c *EvolutionClient) SendLocation(number, name, address string, latitude, longitude float64) error {
	payload := LocationMessagePayload{
		Number:    number,
		Name:      name,
		Address:   address,
		Latitude:  latitude,
		Longitude: longitude,
	}
	_, err := c.sendRequest("POST", "/send/location", payload, true)
	return err
}

func (c *EvolutionClient) GetInstanceInfo() (map[string]interface{}, error) {
	// /instance/info/:instanceId requires instance ID in path, uses admin auth
	return c.sendRequest("GET", "/instance/info/"+c.instance, nil, false)
}

type ConnectPayload struct {
	WebhookUrl      string   `json:"webhookUrl"`
	Subscribe       []string `json:"subscribe"`
	Immediate       bool     `json:"immediate"`
	NatsEnable      string   `json:"natsEnable,omitempty"`
	RabbitmqEnable  string   `json:"rabbitmqEnable,omitempty"`
	WebsocketEnable string   `json:"websocketEnable,omitempty"`
}

func (c *EvolutionClient) ConfigureWebhook(webhookURL string) error {
	payload := ConnectPayload{
		WebhookUrl: webhookURL,
		Subscribe:  []string{"MESSAGE"},
		Immediate:  true,
	}
	// Use instance token for /instance/connect endpoint
	_, err := c.sendRequest("POST", "/instance/connect", payload, true)
	return err
}

var evoCache sync.Map // map[int]evoCacheEntry — TTL-bounded (config changes are rare but must propagate)

type evoCacheEntry struct {
	client    *EvolutionClient
	expiresAt time.Time
}

// evoCacheTTL bounds how long a per-restaurant Evolution client is reused.
// Prevents a stale instance/token after config changes on another replica.
func evoCacheTTL() time.Duration { return tenantCacheTTL() }

// ForRestaurant returns a per-restaurant Evolution client if the restaurant has
// dedicated instance config, otherwise the global client. Cache per restaurant.
func (c *EvolutionClient) ForRestaurant(restaurantID int) *EvolutionClient {
	if restaurantID == 0 || database.DB == nil {
		return c
	}
	if cached, ok := evoCache.Load(restaurantID); ok {
		if entry, ok := cached.(evoCacheEntry); ok && time.Now().Before(entry.expiresAt) {
			return entry.client
		}
	}
	var inst, token string
	err := database.DB.QueryRow(`SELECT COALESCE(evolution_instance,''), COALESCE(evolution_instance_token,'') FROM restaurants WHERE id=$1`, restaurantID).Scan(&inst, &token)
	if err != nil || (inst == "" && token == "") {
		return c
	}
	clone := *c
	if inst != "" {
		clone.instance = inst
	}
	if token != "" {
		clone.instanceToken = token
	}
	evoCache.Store(restaurantID, evoCacheEntry{client: &clone, expiresAt: time.Now().Add(evoCacheTTL())})
	return &clone
}

// InvalidateEvolutionCache clears per-restaurant client on config change.
func InvalidateEvolutionCache(restaurantID int) {
	evoCache.Delete(restaurantID)
}
