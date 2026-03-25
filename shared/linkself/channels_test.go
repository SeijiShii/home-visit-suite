package linkself_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/linkself"
)

func TestAllChannels_Count(t *testing.T) {
	channels := linkself.AllChannels()
	if len(channels) != 23 {
		t.Errorf("AllChannels() returned %d channels, want 23", len(channels))
	}
}

func TestAllChannels_UniqueNames(t *testing.T) {
	channels := linkself.AllChannels()
	seen := make(map[string]bool)
	for _, ch := range channels {
		if seen[ch.Name] {
			t.Errorf("duplicate channel name: %s", ch.Name)
		}
		seen[ch.Name] = true
	}
}

func TestChannelRetention(t *testing.T) {
	tests := []struct {
		channel   linkself.Channel
		wantZero  bool // 0=永続
	}{
		{linkself.ChannelRegions, true},
		{linkself.ChannelPlaces, true},
		{linkself.ChannelAuditLog, true},
		{linkself.ChannelInvitations, false},
		{linkself.ChannelNotifications, false},
	}
	for _, tt := range tests {
		isZero := tt.channel.Retention == 0
		if isZero != tt.wantZero {
			t.Errorf("channel %s: Retention=%v, wantZero=%v", tt.channel.Name, tt.channel.Retention, tt.wantZero)
		}
	}
}

func TestInvitationRetention_90Days(t *testing.T) {
	expected := 90 * 24 * time.Hour
	if linkself.ChannelInvitations.Retention != expected {
		t.Errorf("Invitations retention = %v, want %v", linkself.ChannelInvitations.Retention, expected)
	}
}

func TestNotificationRetention_30Days(t *testing.T) {
	expected := 30 * 24 * time.Hour
	if linkself.ChannelNotifications.Retention != expected {
		t.Errorf("Notifications retention = %v, want %v", linkself.ChannelNotifications.Retention, expected)
	}
}
