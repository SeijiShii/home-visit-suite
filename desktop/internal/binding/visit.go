package binding

import (
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

// VisitBinding は訪問記録ダイアログ・訪問記録画面のフロントエンド向け API。
// 仕様 docs/wants/08_活動メンバー向けアプリ.md「訪問記録ダイアログ」「訪問記録画面」
type VisitBinding struct {
	repo domain.ActivityRepository
	svc  service.ActivityService
}

func NewVisitBinding(repo domain.ActivityRepository, svc service.ActivityService) *VisitBinding {
	return &VisitBinding{repo: repo, svc: svc}
}

// RecordVisit は訪問記録を作成する。
// 申請を伴うステータス（vacant_abandoned / refused）の場合は applicationText が必須で、
// サービス層で Request 作成と AppliedRequestID 紐付けが行われる。
// それ以外のステータスでは applicationText は無視される（空文字列で呼ぶ想定）。
func (b *VisitBinding) RecordVisit(actorID, activityID, placeID string, result models.VisitResult, visitedAt time.Time, applicationText string) (*models.VisitRecord, error) {
	return b.svc.RecordVisit(actorID, activityID, placeID, result, visitedAt, applicationText)
}

// ListVisitRecords は指定区域の全訪問記録を返す（管理アプリ向け閲覧 API）。
func (b *VisitBinding) ListVisitRecords(areaID string) ([]models.VisitRecord, error) {
	return b.repo.ListVisitRecords(areaID)
}

// ListMyVisitHistory は指定場所への自分の訪問記録を返す。
// 訪問記録ダイアログの「自分の訪問履歴」セクション用。
func (b *VisitBinding) ListMyVisitHistory(placeID, userID string) ([]models.VisitRecord, error) {
	return b.repo.ListMyVisitRecordsByPlace(placeID, userID)
}

// GetLastMetDate は指定場所への最新の「会えた」訪問日時を返す（ネットワーク全体集計）。
// 「会えた」記録がない場合は nil を返す。
// 訪問記録ダイアログの「最近会えた日付」表示用。
func (b *VisitBinding) GetLastMetDate(placeID string) (*time.Time, error) {
	records, err := b.repo.ListVisitRecordsByPlace(placeID)
	if err != nil {
		return nil, err
	}

	var latest *time.Time
	for i := range records {
		vr := &records[i]
		if vr.Result != models.VisitResultMet {
			continue
		}
		if latest == nil || vr.VisitedAt.After(*latest) {
			t := vr.VisitedAt
			latest = &t
		}
	}
	return latest, nil
}

// DeleteVisitRecord は訪問記録を削除する。
func (b *VisitBinding) DeleteVisitRecord(id string) error {
	return b.repo.DeleteVisitRecord(id)
}
