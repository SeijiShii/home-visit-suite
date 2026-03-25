package service

import "fmt"

// ErrCode はサービス層のエラーコード。
type ErrCode string

const (
	ErrNotFound          ErrCode = "not_found"
	ErrPermissionDenied  ErrCode = "permission_denied"
	ErrAlreadyExists     ErrCode = "already_exists"
	ErrInvalidState      ErrCode = "invalid_state"
	ErrExclusiveCheckout ErrCode = "exclusive_checkout" // 区域が既にチェックアウト中
	ErrSelfDismissal     ErrCode = "self_dismissal"     // 管理者の自己罷免
	ErrLastAdmin         ErrCode = "last_admin"         // 最後の管理者の罷免
	ErrInvalidInput      ErrCode = "invalid_input"
)

// ServiceError はサービス層の構造化エラー。
type ServiceError struct {
	Code    ErrCode
	Message string
}

func (e *ServiceError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// NewError はServiceErrorを生成する。
func NewError(code ErrCode, msg string) *ServiceError {
	return &ServiceError{Code: code, Message: msg}
}

// Errorf はフォーマット付きServiceErrorを生成する。
func Errorf(code ErrCode, format string, args ...any) *ServiceError {
	return &ServiceError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// IsCode はエラーが指定コードのServiceErrorかを判定する。
func IsCode(err error, code ErrCode) bool {
	if se, ok := err.(*ServiceError); ok {
		return se.Code == code
	}
	return false
}
