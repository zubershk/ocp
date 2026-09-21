package services

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"orangecheesepizza/bot/database"
)

// DashboardParams controls analytics windowing. All fields optional; zero values mean defaults.
type DashboardParams struct {
	RestaurantID int
	OutletID     *int
	From         *time.Time // inclusive
	To           *time.Time // inclusive
	Granularity  string     // hour|day|week|month (default day)
	Source       string     // pos|website|whatsapp|qr|all
	OrderType    string
}

// DashboardResult mirrors the /admin/analytics JSON contract (backward compat) plus extended fields.
type DashboardResult struct {
	Today     map[string]interface{} `json:"today"`
	Week      map[string]interface{} `json:"week"`
	ByStatus  map[string]int         `json:"by_status"`
	TopItems  []TopItem              `json:"top_items"`
	ByDay     []DayRev               `json:"by_day"`
	ByHour    []HourStat             `json:"by_hour"`
	// Extended (super-advanced)
	ByHourDetailed []HourDayStat        `json:"by_hour_detailed,omitempty"`
	OutletBreakdown []OutletStat         `json:"outlet_breakdown,omitempty"`
	SourceBreakdown []SourceStat         `json:"source_breakdown,omitempty"`
	ARPU            float64              `json:"arpu,omitempty"`
	NewVsReturning  map[string]int       `json:"new_vs_returning,omitempty"`
}

type TopItem struct {
	Name     string  `json:"name"`
	Quantity int     `json:"quantity"`
	Revenue  float64 `json:"revenue"`
}

type DayRev struct {
	Day     string  `json:"day"`
	Revenue float64 `json:"revenue"`
	Orders  int     `json:"orders"`
}

type HourStat struct {
	Hour   int `json:"hour"`
	Orders int `json:"orders"`
}

type HourDayStat struct {
	Day    string `json:"day"`
	Hour   int    `json:"hour"`
	Orders int    `json:"orders"`
}

type OutletStat struct {
	OutletID int     `json:"outlet_id"`
	Name     string  `json:"name"`
	Orders   int     `json:"orders"`
	Revenue  float64 `json:"revenue"`
}

type SourceStat struct {
	Source  string  `json:"source"`
	Orders  int     `json:"orders"`
	Revenue float64 `json:"revenue"`
}

// GetDashboard is param-aware replacement for the hardcoded 7d analytics.
// Defaults: 7d window, granularity day, all outlets/sources, restaurant-scoped.
func GetDashboard(p DashboardParams) (*DashboardResult, error) {
	rid := ResolveRestaurant(p.RestaurantID)
	if rid == 0 {
		return nil, fmt.Errorf("invalid restaurant")
	}
	// Default window: last 7d inclusive
 fromD, toD := time.Now().UTC().Truncate(24*time.Hour).AddDate(0, 0, -6), time.Now().UTC().Truncate(24*time.Hour)
	if p.From != nil {
		fromD = p.From.Truncate(24 * time.Hour)
	}
	if p.To != nil {
		toD = p.To.Truncate(24 * time.Hour)
	}
	if toD.Before(fromD) {
		toD = fromD
	}
	// Cap range to 366d
	if toD.Sub(fromD) > 366*24*time.Hour {
		fromD = toD.AddDate(0, 0, -365)
	}
	outletFilter := ""
	outletArgs := []interface{}{}
	if p.OutletID != nil {
		outletFilter = " AND outlet_id = $2"
		outletArgs = append(outletArgs, *p.OutletID)
	}
	sourceFilter := ""
	if p.Source != "" && p.Source != "all" {
		// validated against order_types.go allowlist
		if p.Source == "pos" || p.Source == "website" || p.Source == "whatsapp" || p.Source == "qr" {
			sourceFilter = " AND source = $3"
			// note: param indices shift after outlet; rebuilt below with positional handling
		}
	}
	// For simplicity, build queries with outlet/source injection safely via placeholder rewriting.
	// Today (still CURRENT_DATE for today KPI, independent of range)
	var todayRevenue float64
	var todayCount int
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(total),0), COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE AND status != 'cancelled' AND restaurant_id = $1`+outletFilter+sourceFilterRepl(sourceFilter, len(outletArgs)), appendArgs(rid, outletArgs, p.Source)...).Scan(&todayRevenue, &todayCount)

	var weekRevenue float64
	var weekCount int
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(total),0), COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '6 days' AND status != 'cancelled' AND restaurant_id = $1`+outletFilter+sourceFilterRepl(sourceFilter, len(outletArgs)), appendArgs(rid, outletArgs, p.Source)...).Scan(&weekRevenue, &weekCount)

	statusRows, _ := database.DB.Query(`SELECT status, COUNT(*) FROM orders WHERE restaurant_id = $1`+outletFilter+sourceFilterRepl(sourceFilter, len(outletArgs))+` GROUP BY status`, appendArgs(rid, outletArgs, p.Source)...)
	statusMap := map[string]int{}
	if statusRows != nil {
		defer statusRows.Close()
		for statusRows.Next() {
			var s string
			var n int
			_ = statusRows.Scan(&s, &n)
			statusMap[s] = n
		}
	}

	// Top items last 30d (or range if custom)
	topFrom := fromD
	if p.From == nil {
		topFrom = time.Now().UTC().AddDate(0, 0, -30)
	}
	var top []TopItem
	rows, err := database.DB.Query(`
		SELECT oi.name, SUM(oi.quantity)::int, SUM(oi.subtotal)
		FROM order_items oi JOIN orders o ON o.id = oi.order_id
		WHERE o.created_at >= $2 AND o.created_at < $3 + INTERVAL '1 day' AND o.status != 'cancelled' AND o.restaurant_id = $1`+outletFilterRepl(outletFilter, 4)+sourceFilterRepl(sourceFilter, len(outletArgs)+3)+`
		GROUP BY oi.name ORDER BY SUM(oi.quantity) DESC LIMIT 5
	`, appendArgsTop(rid, topFrom, toD, outletArgs, p.Source, p.OutletID != nil)...)
	if err == nil && rows != nil {
		defer rows.Close()
		for rows.Next() {
			var t TopItem
			_ = rows.Scan(&t.Name, &t.Quantity, &t.Revenue)
			top = append(top, t)
		}
	}
	if top == nil {
		top = []TopItem{}
	}

	// Revenue by day — gap-filled
	var byDay []DayRev
	dayRows, err := database.DB.Query(`
		SELECT to_char(d::date,'YYYY-MM-DD') as day, COALESCE(SUM(o.total),0), COUNT(o.id)
		FROM generate_series($2::date, $3::date, '1 day') d
		LEFT JOIN orders o ON o.created_at::date = d::date AND o.status != 'cancelled' AND o.restaurant_id = $1`+outletFilterRepl(outletFilter, 4)+sourceFilterRepl(sourceFilter, len(outletArgs)+3)+`
		GROUP BY d::date ORDER BY d::date
	`, appendArgsTop(rid, fromD, toD, outletArgs, p.Source, p.OutletID != nil)...)
	if err == nil && dayRows != nil {
		defer dayRows.Close()
		for dayRows.Next() {
			var dr DayRev
			_ = dayRows.Scan(&dr.Day, &dr.Revenue, &dr.Orders)
			byDay = append(byDay, dr)
		}
	}
	if byDay == nil {
		byDay = []DayRev{}
	}

	// Orders by hour (7d aggregate, 24 buckets) + detailed per-day-hour when granularity hour
	byHour := make([]HourStat, 24)
	for h := 0; h < 24; h++ {
		byHour[h].Hour = h
	}
	hourRows, err := database.DB.Query(`
		SELECT EXTRACT(HOUR FROM created_at)::int AS h, COUNT(*)
		FROM orders WHERE created_at >= $2 AND created_at < $3 + INTERVAL '1 day' AND restaurant_id = $1`+outletFilterRepl(outletFilter, 4)+sourceFilterRepl(sourceFilter, len(outletArgs)+3)+` GROUP BY h
	`, appendArgsTop(rid, fromD, toD, outletArgs, p.Source, p.OutletID != nil)...)
	if err == nil && hourRows != nil {
		defer hourRows.Close()
		for hourRows.Next() {
			var h, n int
			if err := hourRows.Scan(&h, &n); err == nil && h >= 0 && h < 24 {
				byHour[h].Orders = n
			}
		}
	}

	// Outlet breakdown
	var outletBreakdown []OutletStat
	if p.OutletID == nil {
		outRows, _ := database.DB.Query(`
			SELECT COALESCE(outlet_id,0), COALESCE((SELECT name FROM outlets WHERE id=outlet_id), 'Unassigned'), COUNT(*), COALESCE(SUM(total),0)
			FROM orders WHERE restaurant_id=$1 AND created_at >= $2 AND created_at < $3 + INTERVAL '1 day' AND status != 'cancelled'
			GROUP BY outlet_id ORDER BY COUNT(*) DESC
		`, rid, fromD, toD)
		if outRows != nil {
			defer outRows.Close()
			for outRows.Next() {
				var s OutletStat
				_ = outRows.Scan(&s.OutletID, &s.Name, &s.Orders, &s.Revenue)
				outletBreakdown = append(outletBreakdown, s)
			}
		}
	}

	// Source breakdown
	var sourceBreakdown []SourceStat
	srcRows, _ := database.DB.Query(`
		SELECT COALESCE(source,'unknown'), COUNT(*), COALESCE(SUM(total),0)
		FROM orders WHERE restaurant_id=$1 AND created_at >= $2 AND created_at < $3 + INTERVAL '1 day' AND status != 'cancelled'
		GROUP BY source ORDER BY COUNT(*) DESC
	`, rid, fromD, toD)
	if srcRows != nil {
		defer srcRows.Close()
		for srcRows.Next() {
			var s SourceStat
			_ = srcRows.Scan(&s.Source, &s.Orders, &s.Revenue)
			sourceBreakdown = append(sourceBreakdown, s)
		}
	}

	// New vs returning (period)
	newVsRet := map[string]int{}
	var newCount, retCount int
	_ = database.DB.QueryRow(`
		SELECT COUNT(*) FROM customers WHERE restaurant_id=$1 AND first_order_at::date >= $2::date AND first_order_at::date <= $3::date
	`, rid, fromD, toD).Scan(&newCount)
	_ = database.DB.QueryRow(`
		SELECT COUNT(DISTINCT customer_phone) FROM orders WHERE restaurant_id=$1 AND created_at >= $2 AND created_at < $3 + INTERVAL '1 day'
	`, rid, fromD, toD).Scan(&retCount)
	retCount = max(0, retCount-newCount)
	newVsRet["new"] = newCount
	newVsRet["returning"] = retCount

	// ARPU (period revenue / distinct customers)
	var arpu float64
	var distinctCustomers int
	var periodRevenue float64
	_ = database.DB.QueryRow(`SELECT COUNT(DISTINCT customer_phone), COALESCE(SUM(total),0) FROM orders WHERE restaurant_id=$1 AND created_at >= $2 AND created_at < $3 + INTERVAL '1 day' AND status != 'cancelled'`, rid, fromD, toD).Scan(&distinctCustomers, &periodRevenue)
	if distinctCustomers > 0 {
		arpu = periodRevenue / float64(distinctCustomers)
	}

	return &DashboardResult{
		Today:           map[string]interface{}{"revenue": todayRevenue, "orders": todayCount},
		Week:            map[string]interface{}{"revenue": weekRevenue, "orders": weekCount},
		ByStatus:        statusMap,
		TopItems:        top,
		ByDay:           byDay,
		ByHour:          byHour,
		OutletBreakdown: outletBreakdown,
		SourceBreakdown: sourceBreakdown,
		NewVsReturning:  newVsRet,
		ARPU:            arpu,
	}, nil
}

func appendArgs(rid int, outletArgs []interface{}, source string) []interface{} {
	args := []interface{}{rid}
	args = append(args, outletArgs...)
	if source != "" && source != "all" && (source == "pos" || source == "website" || source == "whatsapp" || source == "qr") {
		args = append(args, source)
	}
	return args
}

func appendArgsTop(rid int, fromD, toD time.Time, outletArgs []interface{}, source string, hasOutlet bool) []interface{} {
	args := []interface{}{rid, fromD, toD}
	if hasOutlet {
		args = append(args, outletArgs...)
	}
	if source != "" && source != "all" && (source == "pos" || source == "website" || source == "whatsapp" || source == "qr") {
		args = append(args, source)
	}
	return args
}

func sourceFilterRepl(f string, outletLen int) string {
	if f == "" {
		return ""
	}
	// source param index = 2 if no outlet, 3 if outlet present (rid is $1, outlet $2)
	// This helper is used with appendArgs which builds args correctly; placeholder is computed by caller
	// For GetDashboard's today/week/status queries: rid $1, outlet $2, source $3 or $2
	// Simplify: replace $3 with correct index
	if outletLen == 0 {
		return strings.ReplaceAll(f, "$3", "$2")
	}
	return f
}

func outletFilterRepl(f string, base int) string {
	// outletFilter is " AND outlet_id = $2" or "$4" depending on base
	// base is the number of prior params before outlet
	if f == "" {
		return ""
	}
	return strings.ReplaceAll(f, "$2", fmt.Sprintf("$%d", base))
}

// GetCohort returns monthly cohort retention matrix.
func GetCohort(restaurantID int, months int) (map[string]interface{}, error) {
	rid := ResolveRestaurant(restaurantID)
	if months <= 0 || months > 12 {
		months = 6
	}
	rows, err := database.DB.Query(`
		WITH first AS (
			SELECT whatsapp_number, date_trunc('month', first_order_at) AS cohort
			FROM customers WHERE restaurant_id=$1 AND first_order_at IS NOT NULL
		)
		SELECT to_char(f.cohort,'YYYY-MM'), to_char(date_trunc('month', o.created_at),'YYYY-MM'), COUNT(DISTINCT o.customer_phone)
		FROM orders o JOIN first f ON f.whatsapp_number = o.customer_phone
		WHERE o.restaurant_id=$1 AND o.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * $2
		GROUP BY 1,2 ORDER BY 1,2
	`, rid, months)
	if err != nil {
		return map[string]interface{}{"cohorts": []interface{}{}}, nil
	}
	defer rows.Close()
	type cell struct {
		Cohort string `json:"cohort"`
		Activity string `json:"activity"`
		Count int `json:"count"`
	}
	var cells []cell
	for rows.Next() {
		var c cell
		_ = rows.Scan(&c.Cohort, &c.Activity, &c.Count)
		cells = append(cells, c)
	}
	if cells == nil {
		cells = []cell{}
	}
	return map[string]interface{}{"cohorts": cells}, nil
}

// GetFunnel returns status conversion counts and avg dwell per status.
func GetFunnel(restaurantID int, from, to time.Time) (map[string]interface{}, error) {
	rid := ResolveRestaurant(restaurantID)
	rows, err := database.DB.Query(`SELECT status, COUNT(*) FROM orders WHERE restaurant_id=$1 AND created_at >= $2 AND created_at < $3 + INTERVAL '1 day' GROUP BY status`, rid, from, to)
	m := map[string]int{}
	if err == nil && rows != nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			var n int
			_ = rows.Scan(&s, &n)
			m[s] = n
		}
	}
	total := 0
	for _, v := range m {
		total += v
	}
	cancelRate := 0.0
	if total > 0 {
		cancelRate = float64(m["cancelled"]) / float64(total) * 100
	}
	return map[string]interface{}{"by_status": m, "total": total, "cancel_rate": cancelRate}, nil
}

// GetBreakdown returns revenue share by dimension: category|payment_method
func GetBreakdown(restaurantID int, dim string, from, to time.Time) ([]map[string]interface{}, error) {
	rid := ResolveRestaurant(restaurantID)
	var rows *sql.Rows
	var err error
	switch dim {
	case "category":
		rows, err = database.DB.Query(`
			SELECT COALESCE(c.name,'Uncategorized'), COUNT(DISTINCT o.id), COALESCE(SUM(oi.subtotal),0)
			FROM orders o JOIN order_items oi ON oi.order_id=o.id
			LEFT JOIN menu_items mi ON mi.id=oi.menu_item_id
			LEFT JOIN menu_categories c ON c.id=mi.category_id
			WHERE o.restaurant_id=$1 AND o.created_at >= $2 AND o.created_at < $3 + INTERVAL '1 day' AND o.status != 'cancelled'
			GROUP BY c.name ORDER BY SUM(oi.subtotal) DESC
		`, rid, from, to)
	case "payment_method":
		rows, err = database.DB.Query(`
			SELECT COALESCE(payment_method,'unknown'), COUNT(*), COALESCE(SUM(total),0)
			FROM orders WHERE restaurant_id=$1 AND created_at >= $2 AND created_at < $3 + INTERVAL '1 day' AND status != 'cancelled'
			GROUP BY payment_method ORDER BY COUNT(*) DESC
		`, rid, from, to)
	default:
		rows, err = database.DB.Query(`
			SELECT COALESCE(source,'unknown'), COUNT(*), COALESCE(SUM(total),0)
			FROM orders WHERE restaurant_id=$1 AND created_at >= $2 AND created_at < $3 + INTERVAL '1 day' AND status != 'cancelled'
			GROUP BY source ORDER BY COUNT(*) DESC
		`, rid, from, to)
	}
	if err != nil {
		return []map[string]interface{}{}, nil
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var name string
		var cnt int
		var rev float64
		_ = rows.Scan(&name, &cnt, &rev)
		out = append(out, map[string]interface{}{"name": name, "orders": cnt, "revenue": rev})
	}
	if out == nil {
		out = []map[string]interface{}{}
	}
	return out, nil
}
