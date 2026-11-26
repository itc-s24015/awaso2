# places

## テーブル概要
Google Maps Platform等の外部地図サービス上の場所を識別するための最小限の情報を保持する。Google Place IDは永続化し、名称・住所・評価などの外部由来の詳細情報は保存しない。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|アプリ内の場所識別子。|
|provider|text|NN, MK(provider, provider_place_id)|場所情報の提供元。初版では`google_maps`を想定する。|
|provider_place_id|text|NN, MK(provider, provider_place_id)|外部サービス上の場所ID。|
|created_at|timestamptz|NN|初回参照日時。|

名称、住所、評価などの詳細情報は画面表示時に必要な項目だけ取得し、Places APIのFieldMaskで要求項目を限定する。Google Mapsコンテンツには所定の帰属表示を行う。Places APIの料金はFieldMaskに含める中で最も高いSKUに基づくため、営業時間・評価の取得を含め費用を確認する。
