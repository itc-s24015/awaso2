# account_deletion_jobs

## テーブル概要
アカウント削除をStorage API、PostgreSQL、Supabase Authをまたぐ再試行可能な処理として管理する。ジョブ内容はサービスロールを使うサーバー側だけが読み書きできる。Authユーザー削除後はプロフィールのカスケード削除とともにジョブも削除する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|削除ジョブ識別子。|
|user_id|uuid|FK, UK, NN|対象の`user_profiles.id`。同一利用者の重複ジョブを防ぐ。プロフィール削除時にジョブも削除する（`ON DELETE CASCADE`）。|
|stage|text|NN|`storage_cleanup`、`database_cleanup`、`auth_delete`。CHECK制約で限定する。|
|status|text|NN|`queued`、`processing`、`retryable_failure`。CHECK制約で限定する。|
|attempt_count|integer|NN|ジョブ処理の試行回数。0以上のCHECK制約を設定する。|
|lease_expires_at|timestamptz||処理ワーカーのリース期限。期限切れの`processing`ジョブは別ワーカーが再取得できる。|
|last_error_code|text||再試行判断に使う機械可読なエラーコード。生のエラー本文や認証情報は保存しない。|
|requested_at|timestamptz|NN|本人が削除を確認し、ジョブを開始した日時。|
|updated_at|timestamptz|NN|ジョブ状態の最終更新日時。|

処理段階は成功後にのみ次へ進める。`queued`と`processing`はUI上で`削除中`、`retryable_failure`は`再試行が必要`と表示する。Authユーザー削除が成功した場合のみ処理要求への応答で`完了`を表示する。失敗時は段階とエラーコードを保存して再試行対象とし、技術的なエラー本文はユーザーに表示しない。

削除ジョブは処理中の運用情報としてのみ保持し、Authユーザー削除成功時にプロフィールとともに削除する。完了後に個人へ紐づく別の監査記録は保持しない。
