# plan_date_responses

## テーブル概要
メンバーが日程候補に回答した状態を保持する。回答者は自分の回答を更新できる。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|candidate_id|uuid|PK, FK, NN, MK(candidate_id, user_id)|`plan_date_candidates.id`を参照する。|
|user_id|uuid|PK, FK, NN, MK(candidate_id, user_id)|回答者の`user_profiles.id`。|
|response|text|NN|`available`（○）、`conditional`（△）、`unavailable`（×）。CHECK制約で限定する。|
|updated_at|timestamptz|NN|回答・変更日時。|

集計値と推薦順位はこのテーブルに保存せず、回答から取得する。回答者が該当グループの承認済みメンバーであることをRLSで検証する。

回答の新規登録・変更は、企画が`planning`状態で、回答締切が未設定または現在時刻より前の場合に限る。締切後または企画確定後は回答を変更できない。未回答は未回答のまま集計する。
