// Package locale はGo側の多言語対応を提供する。
package locale

import (
	"embed"
	"encoding/json"

	"github.com/nicksnyder/go-i18n/v2/i18n"
	"golang.org/x/text/language"
)

//go:embed ja.json en.json
var localeFS embed.FS

var bundle *i18n.Bundle

func init() {
	bundle = i18n.NewBundle(language.Japanese)
	bundle.RegisterUnmarshalFunc("json", json.Unmarshal)
	bundle.LoadMessageFileFS(localeFS, "ja.json")
	bundle.LoadMessageFileFS(localeFS, "en.json")
}

// NewLocalizer は指定言語のLocalizerを返す。
func NewLocalizer(langs ...string) *i18n.Localizer {
	return i18n.NewLocalizer(bundle, langs...)
}

// T は指定メッセージIDの翻訳文字列を返す。
func T(loc *i18n.Localizer, messageID string, templateData ...map[string]interface{}) string {
	cfg := &i18n.LocalizeConfig{MessageID: messageID}
	if len(templateData) > 0 {
		cfg.TemplateData = templateData[0]
	}
	msg, err := loc.Localize(cfg)
	if err != nil {
		return messageID
	}
	return msg
}
