# plan_date_candidates

## テーブル概要
企画の日程候補を保持する。入力者の端末タイムゾーンで入力値を解釈して絶対時刻として保存し、表示時に閲覧者の端末タイムゾーンへ変換する。利用者ごとのタイムゾーン設定は保存しない。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|候補識別子。|
|plan_id|uuid|FK, NN|`plans.id`を参照する。|
|created_by|uuid|FK|候補を登録した`user_profiles.id`。Auth削除時に`ON DELETE SET NULL`とし、共有候補を残す。|
|starts_at|timestamptz|NN|開始日時。|
|ends_at|timestamptz|NN|終了日時。`ends_at > starts_at`のCHECK制約を設定する。|
|created_at|timestamptz|NN|登録日時。|
|updated_at|timestamptz|NN|更新日時。|

`(plan_id, id)`の複合一意制約を設け、確定情報から同一企画の候補だけを参照できる複合外部キーに利用する。予定確定前は承認済みのグループメンバーが候補を追加・編集できる。確定後の候補編集は企画作成者だけに許可し、RLSで制御する。
