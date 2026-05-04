#target bridge

/*
Adobe Bridge 用: JPG フォルダのレーティングを同名 RAW ファイルへ同期します。

このファイルを Bridge の起動スクリプトとして配置すると、次のメニューを追加します。
Tools > JPGのレーティングを同名RAWに同期
*/

var SYNC_JPG_RATING_TO_RAW_CONFIG = {
    menuId: "syncJpgRatingToRaw",
    menuLabel: "JPGのレーティングを同名RAWに同期",
    maxReportItems: 20,
    xmpNamespace: "http://ns.adobe.com/xap/1.0/"
};

// 対象拡張子を増やしたい場合は、このリストを編集してください。
var JPG_EXTENSIONS = [
    "jpg",
    "jpeg"
];

var RAW_EXTENSIONS = [
    "raf",
    "dng",
    "cr2",
    "cr3",
    "nef",
    "arw",
    "orf",
    "rw2",
    "pef",
    "sr2",
    "srf"
];

if (BridgeTalk.appName == "bridge") {
    installMenu();
}

function installMenu() {
    var command = null;

    try {
        command = MenuElement.find(SYNC_JPG_RATING_TO_RAW_CONFIG.menuId);
    } catch (findError) {
        command = null;
    }

    if (command == null) {
        command = MenuElement.create(
            "command",
            SYNC_JPG_RATING_TO_RAW_CONFIG.menuLabel,
            "at the end of Tools",
            SYNC_JPG_RATING_TO_RAW_CONFIG.menuId
        );
    }

    command.onSelect = function () {
        main();
    };
}

function main() {
    if (BridgeTalk.appName != "bridge") {
        alert("このスクリプトは Adobe Bridge で実行してください。");
        return;
    }

    var jpgFolder = selectJpgFolder();
    if (jpgFolder == null) {
        alert("JPGフォルダの選択がキャンセルされたため、処理を中止しました。");
        return;
    }

    var rawFolder = selectRawFolder(jpgFolder);
    if (rawFolder == null) {
        alert("RAWフォルダの選択がキャンセルされたため、処理を中止しました。");
        return;
    }

    try {
        var jpgFiles = getJpgFiles(jpgFolder);
        var rawIndex = buildRawIndex(rawFolder);
        var result = syncRatings(jpgFiles, rawIndex);

        result.jpgFolder = jpgFolder;
        result.rawFolder = rawFolder;
        showResult(result);
    } catch (error) {
        alert("処理を続行できないエラーが発生しました。\n\n" + getErrorMessage(error));
    }
}

function selectJpgFolder() {
    return selectFolder("レーティング元の JPG フォルダを選択してください。", getCurrentBridgeFolder());
}

function selectRawFolder(jpgFolder) {
    var startFolder = getCurrentBridgeFolder();

    if (startFolder == null) {
        try {
            if (jpgFolder != null && jpgFolder.parent != null) {
                startFolder = jpgFolder.parent;
            }
        } catch (error) {
            startFolder = null;
        }
    }

    return selectFolder("レーティング反映先の RAW フォルダを選択してください。", startFolder);
}

function getCurrentBridgeFolder() {
    var folder = null;
    var selections;

    try {
        if (app.document != null) {
            folder = getExistingFolderFromPath(app.document.presentationPath);
            if (folder != null) {
                return folder;
            }
        }
    } catch (presentationPathError) {
        folder = null;
    }

    try {
        if (app.document != null && app.document.thumbnail != null) {
            folder = getFolderFromThumbnail(app.document.thumbnail);
            if (folder != null) {
                return folder;
            }
        }
    } catch (thumbnailError) {
        folder = null;
    }

    try {
        if (app.document != null && app.document.selections != null) {
            selections = app.document.selections;
            if (selections.length > 0) {
                folder = getFolderFromThumbnail(selections[0]);
                if (folder != null) {
                    return folder;
                }
            }
        }
    } catch (selectionError) {
        folder = null;
    }

    return null;
}

function getExistingFolderFromPath(path) {
    var folder;

    if (path == null || path == "") {
        return null;
    }

    try {
        folder = new Folder(path);
        if (folder.exists) {
            return folder;
        }
    } catch (error) {
        return null;
    }

    return null;
}

function getFolderFromThumbnail(thumbnail) {
    var spec;
    var folder;

    if (thumbnail == null) {
        return null;
    }

    try {
        spec = thumbnail.spec;

        if (spec instanceof Folder && spec.exists) {
            return spec;
        }

        if (spec instanceof File && spec.parent != null && spec.parent.exists) {
            return spec.parent;
        }
    } catch (specError) {
        spec = null;
    }

    try {
        folder = getExistingFolderFromPath(thumbnail.path);
        if (folder != null) {
            return folder;
        }
    } catch (pathError) {
        folder = null;
    }

    return null;
}

function selectFolder(prompt, startFolder) {
    if (startFolder != null && startFolder.exists) {
        try {
            if (typeof startFolder.selectDlg == "function") {
                return startFolder.selectDlg(prompt);
            }
        } catch (selectDlgError) {
            // 下の Folder.selectDialog() にフォールバックします。
        }

        try {
            if (typeof Folder.selectDialog == "function") {
                return Folder.selectDialog(prompt, startFolder);
            }
        } catch (selectDialogWithStartError) {
            // ExtendScript のバージョンによっては起点フォルダ指定を受け付けません。
        }
    }

    try {
        if (typeof Folder.selectDialog == "function") {
            return Folder.selectDialog(prompt);
        }
    } catch (selectDialogError) {
        return null;
    }

    return null;
}

function getJpgFiles(folder) {
    var files = folder.getFiles(function (item) {
        return item instanceof File && isExtensionAllowed(getExtension(item.name), JPG_EXTENSIONS);
    });

    if (files == null) {
        return [];
    }

    return sortFilesByName(files);
}

function buildRawIndex(rawFolder) {
    var rawFiles = rawFolder.getFiles(function (item) {
        return item instanceof File && isExtensionAllowed(getExtension(item.name), RAW_EXTENSIONS);
    });
    var index = {};
    var i;
    var rawFile;
    var key;

    if (rawFiles == null) {
        return index;
    }

    rawFiles = sortFilesByName(rawFiles);

    for (i = 0; i < rawFiles.length; i++) {
        rawFile = rawFiles[i];
        key = getIndexKey(rawFile.name);

        if (!index[key]) {
            index[key] = [];
        }

        index[key].push(rawFile);
    }

    return index;
}

function getBaseName(fileName) {
    var dotIndex = fileName.lastIndexOf(".");

    if (dotIndex <= 0) {
        return fileName;
    }

    return fileName.substring(0, dotIndex);
}

function getExtension(fileName) {
    var dotIndex = fileName.lastIndexOf(".");

    if (dotIndex < 0 || dotIndex == fileName.length - 1) {
        return "";
    }

    return fileName.substring(dotIndex + 1).toLowerCase();
}

function syncRatings(jpgFiles, rawIndex) {
    var result = createResult(jpgFiles.length);
    var i;
    var jpgFile;
    var key;
    var rawCandidates;
    var rawFile;
    var rating;

    for (i = 0; i < jpgFiles.length; i++) {
        jpgFile = jpgFiles[i];
        key = getIndexKey(jpgFile.name);
        rawCandidates = rawIndex[key];

        if (rawCandidates == null || rawCandidates.length == 0) {
            result.notFoundCount++;
            addReportItem(result.notFoundFiles, getDisplayName(jpgFile));
            continue;
        }

        if (rawCandidates.length > 1) {
            result.multipleCount++;
            addReportItem(
                result.multipleFiles,
                getDisplayName(jpgFile) + " -> " + joinFileNames(rawCandidates)
            );
            continue;
        }

        rawFile = rawCandidates[0];

        try {
            rating = getThumbnailRating(new Thumbnail(jpgFile));
            setThumbnailRating(new Thumbnail(rawFile), rating);
            result.successCount++;
        } catch (error) {
            result.errorCount++;
            addReportItem(
                result.errorFiles,
                getDisplayName(jpgFile) + " -> " + getDisplayName(rawFile) + ": " + getErrorMessage(error)
            );
        }
    }

    return result;
}

function showResult(result) {
    var lines = [];

    lines.push("JPGのレーティング同期が完了しました。");
    lines.push("");
    lines.push("JPGフォルダ: " + getFolderName(result.jpgFolder));
    lines.push("RAWフォルダ: " + getFolderName(result.rawFolder));
    lines.push("");
    lines.push("JPG対象ファイル数: " + result.jpgCount);
    lines.push("同期成功数: " + result.successCount);
    lines.push("RAWが見つからなかった件数: " + result.notFoundCount);
    lines.push("複数RAW候補のためスキップした件数: " + result.multipleCount);
    lines.push("エラー件数: " + result.errorCount);

    appendReportSection(lines, "RAWが見つからなかったファイル", result.notFoundFiles, result.notFoundCount);
    appendReportSection(lines, "複数RAW候補のためスキップしたファイル", result.multipleFiles, result.multipleCount);
    appendReportSection(lines, "エラーが発生したファイル", result.errorFiles, result.errorCount);

    alert(lines.join("\n"));
}

function createResult(jpgCount) {
    return {
        jpgCount: jpgCount,
        successCount: 0,
        notFoundCount: 0,
        multipleCount: 0,
        errorCount: 0,
        notFoundFiles: [],
        multipleFiles: [],
        errorFiles: [],
        jpgFolder: null,
        rawFolder: null
    };
}

function getIndexKey(fileName) {
    // OS 差異を避けるため、ベースファイル名は大文字小文字を区別せず照合します。
    return "key:" + getBaseName(fileName).toLowerCase();
}

function isExtensionAllowed(extension, extensionList) {
    var i;
    var normalized = extension.toLowerCase();

    for (i = 0; i < extensionList.length; i++) {
        if (normalized == extensionList[i].toLowerCase()) {
            return true;
        }
    }

    return false;
}

function getThumbnailRating(thumbnail) {
    var rating = thumbnail.rating;

    if (rating === undefined || rating === null || rating === "") {
        rating = getThumbnailMetadataRating(thumbnail);
    }

    return normalizeRating(rating);
}

function getThumbnailMetadataRating(thumbnail) {
    var metadata;

    try {
        metadata = thumbnail.synchronousMetadata;

        if (metadata == null) {
            return 0;
        }

        metadata.namespace = SYNC_JPG_RATING_TO_RAW_CONFIG.xmpNamespace;
        return metadata.Rating;
    } catch (error) {
        return 0;
    }
}

function setThumbnailRating(thumbnail, rating) {
    // rating が 0 の場合も必ず代入します。0 は「未評価」であり同期対象です。
    thumbnail.rating = rating;
}

function normalizeRating(rating) {
    var normalized;

    if (rating === undefined || rating === null || rating === "") {
        return 0;
    }

    normalized = Number(rating);

    if (isNaN(normalized)) {
        return 0;
    }

    return normalized;
}

function addReportItem(items, value) {
    if (items.length < SYNC_JPG_RATING_TO_RAW_CONFIG.maxReportItems) {
        items.push(value);
    }
}

function appendReportSection(lines, title, items, totalCount) {
    var i;
    var omittedCount;

    if (totalCount <= 0 || items.length == 0) {
        return;
    }

    lines.push("");
    lines.push(title + "（先頭 " + items.length + " 件）:");

    for (i = 0; i < items.length; i++) {
        lines.push("- " + items[i]);
    }

    omittedCount = totalCount - items.length;
    if (omittedCount > 0) {
        lines.push("...ほか " + omittedCount + " 件");
    }
}

function sortFilesByName(files) {
    files.sort(function (left, right) {
        var leftName = getDisplayName(left).toLowerCase();
        var rightName = getDisplayName(right).toLowerCase();

        if (leftName < rightName) {
            return -1;
        }

        if (leftName > rightName) {
            return 1;
        }

        return 0;
    });

    return files;
}

function joinFileNames(files) {
    var names = [];
    var i;

    for (i = 0; i < files.length; i++) {
        names.push(getDisplayName(files[i]));
    }

    return names.join(", ");
}

function getDisplayName(file) {
    try {
        return decodeURI(file.name);
    } catch (error) {
        return file.name;
    }
}

function getFolderName(folder) {
    if (folder == null) {
        return "";
    }

    try {
        return folder.fsName;
    } catch (error) {
        return folder.toString();
    }
}

function getErrorMessage(error) {
    if (error == null) {
        return "不明なエラー";
    }

    if (error.message) {
        return error.message;
    }

    return error.toString();
}
