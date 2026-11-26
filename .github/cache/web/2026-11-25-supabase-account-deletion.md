# Supabaseアカウント削除の調査

確認日: 2026-11-25

## 公式資料
- [Supabase Auth: User Management / Deleting users](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users)
- [Supabase Storage: Delete Objects](https://supabase.com/docs/guides/storage/management/delete-objects)

## 確認事項
- Supabase Authユーザーに紐づく公開プロフィールは、`auth.users.id`を参照する外部キーと`ON DELETE CASCADE`で整合性を保てる。
- Storageオブジェクトを所有するユーザーはAuthから削除できない場合があり、先に対象オブジェクトを削除または所有権移管する必要がある。
- StorageファイルはStorage APIで削除する。`storage.objects`をSQLで直接削除してもファイル本体は消えず、孤立データになる。
- Storage APIの`remove`は1回あたり最大1,000オブジェクト。大きな対象は分割する。
- Auth削除でリフレッシュトークンは無効化されるが、既発行アクセストークンJWTは期限まで有効な可能性がある。削除中プロフィールの状態をRLSで検査し、無効化状態を拒否する必要がある。

## あわそ設計への適用
- 削除開始を永続ジョブとして記録し、プロフィールを`deletion_pending`にしてRLSアクセスを遮断する。
- Storage対象オブジェクトと個別の削除進捗を記録し、Storage APIで分割削除する。
- Storage削除後にPostgreSQL関連データをトランザクションで削除・匿名化し、Supabase Authユーザー削除を最後に実行する。
- 途中失敗時はジョブ段階を保持し、削除完了を表示せず同じジョブを再試行する。
