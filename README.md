# adobe-bridge-script

Adobe Bridge 用の ExtendScript / JSX スクリプト置き場です。

## sync-jpg-rating-to-raw.jsx

`sync-jpg-rating-to-raw.jsx` は、JPG フォルダ内の `.jpg` / `.jpeg` のレーティングを、別フォルダにある同名 RAW ファイルへ同期します。

JPG を RAW フォルダへコピーしたり、ファイル名を変更したり、ファイルを削除したりはしません。変更するのは、同名 RAW が 1 件だけ見つかった場合の RAW 側レーティングだけです。

### 使い方

1. `sync-jpg-rating-to-raw.jsx` を Adobe Bridge の起動スクリプトフォルダに配置します。
2. Adobe Bridge を再起動します。
3. `Tools` メニューから `JPGのレーティングを同名RAWに同期` を実行します。
4. レーティング元の JPG フォルダを選択します。
5. レーティング反映先の RAW フォルダを選択します。
6. 完了ダイアログで同期結果を確認します。

フォルダ選択ダイアログは、可能な場合は Bridge で現在表示・選択されているフォルダを初期フォルダとして開きます。

### 配置場所の例

環境や Bridge のバージョンによりパスは異なります。

- macOS: `~/Library/Application Support/Adobe/Bridge <version>/Startup Scripts/`
- Windows: `%APPDATA%\Adobe\Bridge <version>\Startup Scripts\`

Bridge の `Preferences > Startup Scripts` から、起動スクリプトの場所や有効状態を確認してください。

### 対象拡張子

JPG 側:

- `.jpg`
- `.jpeg`

RAW 側:

- `.raf`
- `.dng`
- `.cr2`
- `.cr3`
- `.nef`
- `.arw`
- `.orf`
- `.rw2`
- `.pef`
- `.sr2`
- `.srf`

RAW 拡張子を増減したい場合は、スクリプト上部の `RAW_EXTENSIONS` を編集してください。

### 注意点

- 対象は選択したフォルダ直下のファイルのみです。サブフォルダは再帰処理しません。
- Bridge の現在フォルダを取得できない場合、RAW フォルダ選択では JPG フォルダの親フォルダを初期フォルダとして使います。
- 拡張子判定は大文字小文字を区別しません。
- ベースファイル名も、OS 差異を避けるため大文字小文字を区別せず照合します。
- 同じベースファイル名で RAW 候補が複数ある場合は、安全のため同期せずスキップします。
- JPG 側のレーティングが `0` の場合も RAW 側へ反映します。
- RAW 側の既存レーティングは JPG 側の値で上書きします。
- RAW のレーティングは Bridge / Camera Raw の設定により XMP サイドカーへ反映される場合があります。必要に応じて Bridge のメタデータ設定を確認してください。

### 動作確認観点

- Bridge 起動後、`Tools` メニューに `JPGのレーティングを同名RAWに同期` が表示されること。
- JPG フォルダ選択をキャンセルした場合、処理が中止されること。
- RAW フォルダ選択をキャンセルした場合、処理が中止されること。
- `DSCF0001.jpg` と `DSCF0001.raf` のような同名ペアで、JPG の `0` / `1`〜`5` が RAW 側へ上書きされること。
- `DSCF0001.raf` と `DSCF0001.dng` のように複数 RAW 候補がある場合、同期されずスキップ件数に入ること。
- 同名 RAW がない JPG が、未検出件数に入ること。
- `.JPG` / `.JPEG` / `.RAF` など、大文字小文字違いの拡張子でも対象になること。
