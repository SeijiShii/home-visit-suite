package binding_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func newSettingsBinding() *binding.SettingsBinding {
	return binding.NewSettingsBinding(repository.NewInMemoryPersonalRepository())
}

func TestSettingsBinding_HiddenTips_InitialEmpty(t *testing.T) {
	b := newSettingsBinding()
	keys, err := b.GetHiddenTipKeys()
	if err != nil {
		t.Fatalf("GetHiddenTipKeys: %v", err)
	}
	if len(keys) != 0 {
		t.Errorf("want empty, got %v", keys)
	}
}

func TestSettingsBinding_HiddenTips_SetAndGet(t *testing.T) {
	b := newSettingsBinding()
	if err := b.SetTipHidden("tips.map.polygon.startDraw", true); err != nil {
		t.Fatalf("SetTipHidden: %v", err)
	}
	keys, _ := b.GetHiddenTipKeys()
	if len(keys) != 1 || keys[0] != "tips.map.polygon.startDraw" {
		t.Errorf("got %v, want [tips.map.polygon.startDraw]", keys)
	}
}

func TestSettingsBinding_HiddenTips_SetFalseIsNoop(t *testing.T) {
	b := newSettingsBinding()
	_ = b.SetTipHidden("tips.map.polygon.startDraw", true)
	// hidden=false は現状 noop（個別解除は未仕様）
	if err := b.SetTipHidden("tips.map.polygon.startDraw", false); err != nil {
		t.Fatalf("SetTipHidden(false): %v", err)
	}
	keys, _ := b.GetHiddenTipKeys()
	if len(keys) != 1 {
		t.Errorf("false should be noop, got %v", keys)
	}
}

func TestSettingsBinding_ResetHiddenTips(t *testing.T) {
	b := newSettingsBinding()
	_ = b.SetTipHidden("tips.map.polygon.startDraw", true)
	_ = b.SetTipHidden("tips.map.polygon.moveVertex", true)
	if err := b.ResetHiddenTips(); err != nil {
		t.Fatalf("ResetHiddenTips: %v", err)
	}
	keys, _ := b.GetHiddenTipKeys()
	if len(keys) != 0 {
		t.Errorf("after reset, want empty, got %v", keys)
	}
}

func TestSettingsBinding_Locale_InitialEmpty(t *testing.T) {
	b := newSettingsBinding()
	loc, err := b.GetLocale()
	if err != nil {
		t.Fatalf("GetLocale: %v", err)
	}
	if loc != "" {
		t.Errorf("want empty, got %q", loc)
	}
}

func TestSettingsBinding_Locale_SetAndGet(t *testing.T) {
	b := newSettingsBinding()
	if err := b.SetLocale("en"); err != nil {
		t.Fatalf("SetLocale: %v", err)
	}
	loc, _ := b.GetLocale()
	if loc != "en" {
		t.Errorf("got %q, want en", loc)
	}
}
