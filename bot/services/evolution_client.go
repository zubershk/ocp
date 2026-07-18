package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"orangecheesepizza/bot/config"
)

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

	req, err := http.NewRequest(method, url, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Use instance token for send endpoints, global API key for admin endpoints
	if useInstanceToken && c.instanceToken != "" {
		req.Header.Set("apikey", c.instanceToken)
	} else {
		req.Header.Set("apikey", c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("API error: %v", result)
	}

	return result, nil
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
	payload := ButtonMessagePayload{
		Number:      number,
		Title:       title,
		Description: description,
		Footer:      footer,
		Buttons:     buttons,
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
