package services

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"orangecheesepizza/bot/database"
)

// couponTestRid returns a throwaway restaurant id that has a real FK-backed
// row, or skips when no staging DB is configured.
func couponTestRid(t *testing.T) int {
	t.Helper()
	stagingDB(t)
	rid := ResolveRestaurant(0)
	if rid == 0 {
		t.Skip("no bootstrap restaurant in staging DB")
	}
	return rid
}

func cleanupCoupon(t *testing.T, code string, rid int) {
	t.Cleanup(func() {
		_, _ = database.DB.Exec(`DELETE FROM coupons WHERE code=$1 AND restaurant_id=$2`, code, rid)
	})
}

func TestCouponValidate_PercentageAndCap(t *testing.T) {
	rid := couponTestRid(t)
	code := fmt.Sprintf("TESTPCT%d", time.Now().UnixNano())
	cleanupCoupon(t, code, rid)
	_, err := database.DB.Exec(`
		INSERT INTO coupons (restaurant_id, code, type, value, min_subtotal, max_discount, is_active, starts_at)
		VALUES ($1,$2,'percentage',10,0,50,true,NOW()-INTERVAL '1 day')`, rid, code)
	if err != nil {
		t.Fatalf("seed coupon: %v", err)
	}
	svc := NewCouponService()
	// 10% of 1000 = 100, under the 50 cap? No — cap is 50, so expect 50.
	res, err := svc.Validate(code, rid, 1000)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if res.Discount != 50 {
		t.Fatalf("expected capped discount 50, got %v", res.Discount)
	}
	if res.NewTotal != 950 {
		t.Fatalf("expected new total 950, got %v", res.NewTotal)
	}
	// 10% of 200 = 20, under cap.
	res, err = svc.Validate(code, rid, 200)
	if err != nil || res.Discount != 20 {
		t.Fatalf("expected discount 20, got %v err=%v", res, err)
	}
}

func TestCouponValidate_FixedClampedToSubtotal(t *testing.T) {
	rid := couponTestRid(t)
	code := fmt.Sprintf("TESTFIX%d", time.Now().UnixNano())
	cleanupCoupon(t, code, rid)
	_, err := database.DB.Exec(`
		INSERT INTO coupons (restaurant_id, code, type, value, min_subtotal, is_active, starts_at)
		VALUES ($1,$2,'fixed',500,0,true,NOW()-INTERVAL '1 day')`, rid, code)
	if err != nil {
		t.Fatalf("seed coupon: %v", err)
	}
	res, err := NewCouponService().Validate(code, rid, 100)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if res.Discount != 100 {
		t.Fatalf("fixed discount must clamp to subtotal 100, got %v", res.Discount)
	}
}

func TestCouponIncrementUse_AtomicUnderConcurrency(t *testing.T) {
	rid := couponTestRid(t)
	code := fmt.Sprintf("TESTCON%d", time.Now().UnixNano())
	cleanupCoupon(t, code, rid)
	_, err := database.DB.Exec(`
		INSERT INTO coupons (restaurant_id, code, type, value, min_subtotal, usage_limit, used_count, is_active, starts_at)
		VALUES ($1,$2,'fixed',10,0,1,0,true,NOW()-INTERVAL '1 day')`, rid, code)
	if err != nil {
		t.Fatalf("seed coupon: %v", err)
	}
	const goroutines = 8
	var success atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			ok, err := NewCouponService().IncrementUseIfAvailable(code, rid)
			if err != nil {
				t.Errorf("increment: %v", err)
				return
			}
			if ok {
				success.Add(1)
			}
		}()
	}
	close(start)
	wg.Wait()
	if got := success.Load(); got != 1 {
		t.Fatalf("expected exactly 1 successful redemption of a 1-use coupon, got %d", got)
	}
	var used int
	_ = database.DB.QueryRow(`SELECT used_count FROM coupons WHERE code=$1 AND restaurant_id=$2`, code, rid).Scan(&used)
	if used != 1 {
		t.Fatalf("expected used_count=1, got %d", used)
	}
}
