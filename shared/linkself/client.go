// Package linkself はLinkSelfとの統合層を提供する。
// link-selfコアライブラリをラップし、home-visit-suite固有のデータ同期を行う。
package linkself

// Client はLinkSelfクライアントのインターフェース。
// デスクトップ・モバイル両方から利用される。
type Client interface {
	// Connect はLinkSelfネットワークに接続する。
	Connect() error

	// Disconnect は切断する。
	Disconnect() error

	// SyncData はグループ内のデータ同期を実行する。
	SyncData() error
}
