# group_members

## テーブル概要
承認済みのグループメンバーと権限を保持する。申請中・拒否済みの利用者はこのテーブルに登録しない。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|group_id|uuid|PK, FK, NN, MK(group_id, user_id)|`groups.id`を参照する。グループ削除時は関連メンバーを削除する。|
|user_id|uuid|PK, FK, NN, MK(group_id, user_id)|`user_profiles.id`を参照する。|
|role|text|NN|`admin`または`member`。許容値をCHECK制約で限定する。|
|joined_at|timestamptz|NN|参加承認日時。|
|preference_learning_consented_at|timestamptz||グループ好み学習への同意日時。NULLは未同意または撤回済みを示す。新規メンバーはNULLで開始する。|

`group_id`ごとに`role = 'admin'`となる行を最大1件にする部分一意索引を設定する。管理者が退会する場合は、`joined_at`が最も早いメンバーへ移譲し、同時刻の場合は`user_id`昇順で決定する。管理者が必ず1人在籍することは、グループ作成・退会・移譲処理を単一トランザクションで実行して保証する。

グループ好み学習は、グループに所属する全メンバーの`preference_learning_consented_at`が設定されている場合のみ有効にする。メンバー追加または同意撤回により未同意者がいる間は停止する。学習専用の履歴・集計データは永続化せず、全員同意が再成立した場合は通常機能のため保持されている元履歴から都度再計算する。
