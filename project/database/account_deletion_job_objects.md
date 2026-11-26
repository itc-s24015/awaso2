# account_deletion_job_objects

## テーブル概要
アカウント削除で消すStorageオブジェクトをジョブ単位で記録し、オブジェクトごとに再試行できるようにする。ジョブと同様にサービスロールを使うサーバー側だけがアクセスする。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|オブジェクト削除記録の識別子。|
|job_id|uuid|FK, NN|`account_deletion_jobs.id`を参照する。ジョブ削除時に記録も削除する。|
|bucket_id|text|NN, MK(job_id, bucket_id, object_path)|対象Storageバケット。|
|object_path|text|NN, MK(job_id, bucket_id, object_path)|対象ファイルのパス。|
|status|text|NN|`pending`、`deleted`、`retryable_failure`。CHECK制約で限定する。|
|attempt_count|integer|NN|削除試行回数。0以上のCHECK制約を設定する。|
|last_error_code|text||再試行判断に使う機械可読なエラーコード。|
|updated_at|timestamptz|NN|状態の最終更新日時。|

削除対象は削除開始時に確定して記録する。ユーザーIDを含むパスをStorage APIで列挙し、削除対象企画・グループに紐づくパスも加える。ファイル本体はSQLで消さず、Supabase Storage APIで最大1,000件ずつ削除する。削除を再試行した際に対象が既に存在しない場合は成功済みとして記録し、実在する失敗分のみ再試行する。
