package models_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestAccessMode_Values(t *testing.T) {
	if string(models.AccessModeEditable) != "editable" {
		t.Errorf("AccessModeEditable = %q", models.AccessModeEditable)
	}
	if string(models.AccessModeReadOnly) != "read_only" {
		t.Errorf("AccessModeReadOnly = %q", models.AccessModeReadOnly)
	}
}

func TestAccessMode_Combine(t *testing.T) {
	tests := []struct {
		name  string
		a, b  models.AccessMode
		want  models.AccessMode
	}{
		{"editable & editable -> editable", models.AccessModeEditable, models.AccessModeEditable, models.AccessModeEditable},
		{"editable & read_only -> read_only", models.AccessModeEditable, models.AccessModeReadOnly, models.AccessModeReadOnly},
		{"read_only & editable -> read_only (parent dominates)", models.AccessModeReadOnly, models.AccessModeEditable, models.AccessModeReadOnly},
		{"read_only & read_only -> read_only", models.AccessModeReadOnly, models.AccessModeReadOnly, models.AccessModeReadOnly},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.a.Combine(tt.b); got != tt.want {
				t.Errorf("Combine(%q, %q) = %q, want %q", tt.a, tt.b, got, tt.want)
			}
		})
	}
}
