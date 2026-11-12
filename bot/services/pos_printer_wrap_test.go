package services

import (
	"reflect"
	"testing"
)

func TestWrapLabel(t *testing.T) {
	cases := []struct {
		name  string
		label string
		width int
		want  []string
	}{
		{
			name:  "fits on one line",
			label: "2 x Onion - Value Pizza",
			width: 26,
			want:  []string{"2 x Onion - Value Pizza"},
		},
		{
			name:  "no orphaned trailing word",
			label: "2 x Golden Corn - Value Pizza",
			width: 26,
			want:  []string{"2 x Golden Corn -", "Value Pizza"},
		},
		{
			name:  "breaks on word boundaries",
			label: "1 x Extra Long Farmhouse Special Cheese Pizza",
			width: 20,
			want:  []string{"1 x Extra Long", "Farmhouse Special", "Cheese Pizza"},
		},
		{
			name:  "single word longer than the width",
			label: "Supercalifragilistic",
			width: 8,
			want:  []string{"Supercalifragilistic"},
		},
		{
			name:  "empty label",
			label: "   ",
			width: 26,
			want:  nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := wrapLabel(tc.label, tc.width)
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("wrapLabel(%q, %d) = %#v, want %#v", tc.label, tc.width, got, tc.want)
			}
		})
	}
}
