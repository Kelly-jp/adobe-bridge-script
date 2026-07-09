#target bridge

/*
Adobe Bridge 用: JPG / RAW フォルダ間で同名ファイルのレーティングを同期します。

このファイルを Bridge の起動スクリプトとして配置すると、次のメニューを追加します。
Tools > JPGのレーティングを同名RAWに同期
Tools > RAWのレーティングを同名JPGに同期
*/

var SYNC_JPG_RATING_TO_RAW_CONFIG = {
    menuId: "syncJpgRatingToRaw",
    menuLabel: "JPGのレーティングを同名RAWに同期",
    reverseMenuId: "syncRawRatingToJpg",
    reverseMenuLabel: "RAWのレーティングを同名JPGに同期",
    maxReportItems: 20,
    parallelWorkers: 4,
    workerBatchSize: 8,
    xmpNamespace: "http://ns.adobe.com/xap/1.0/"
};

var SYNC_JPG_RATING_TO_RAW_SESSIONS = {};
var SYNC_JPG_RATING_TO_RAW_SESSION_ID = 0;

// 対象拡張子を増やしたい場合は、このリストを編集してください。
// 判定時に小文字化するため、ここは小文字で定義しておけば大文字拡張子にも一致します。
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
    installCommand(
        SYNC_JPG_RATING_TO_RAW_CONFIG.menuId,
        SYNC_JPG_RATING_TO_RAW_CONFIG.menuLabel,
        function () {
            main(createSyncDirection("jpgToRaw"));
        }
    );

    installCommand(
        SYNC_JPG_RATING_TO_RAW_CONFIG.reverseMenuId,
        SYNC_JPG_RATING_TO_RAW_CONFIG.reverseMenuLabel,
        function () {
            main(createSyncDirection("rawToJpg"));
        }
    );
}

function installCommand(menuId, menuLabel, onSelect) {
    var command = null;

    try {
        command = MenuElement.find(menuId);
    } catch (findError) {
        command = null;
    }

    if (command == null) {
        command = MenuElement.create(
            "command",
            menuLabel,
            "at the end of Tools",
            menuId
        );
    }

    command.onSelect = onSelect;
}

function createSyncDirection(directionName) {
    if (directionName == "rawToJpg") {
        return {
            completionLabel: "RAWからJPGへのレーティング同期",
            sourceLabel: "RAW",
            targetLabel: "JPG",
            sourceExtensions: RAW_EXTENSIONS,
            targetExtensions: JPG_EXTENSIONS,
            sourcePrompt: "レーティング元の RAW フォルダを選択してください。",
            targetPrompt: "レーティング反映先の JPG フォルダを選択してください。"
        };
    }

    return {
        completionLabel: "JPGからRAWへのレーティング同期",
        sourceLabel: "JPG",
        targetLabel: "RAW",
        sourceExtensions: JPG_EXTENSIONS,
        targetExtensions: RAW_EXTENSIONS,
        sourcePrompt: "レーティング元の JPG フォルダを選択してください。",
        targetPrompt: "レーティング反映先の RAW フォルダを選択してください。"
    };
}

function main(direction) {
    if (BridgeTalk.appName != "bridge") {
        alert("このスクリプトは Adobe Bridge で実行してください。");
        return;
    }

    var sourceFolder = selectSourceFolder(direction);
    if (sourceFolder == null) {
        alert(direction.sourceLabel + "フォルダの選択がキャンセルされたため、処理を中止しました。");
        return;
    }

    var targetFolder = selectTargetFolder(direction, sourceFolder);
    if (targetFolder == null) {
        alert(direction.targetLabel + "フォルダの選択がキャンセルされたため、処理を中止しました。");
        return;
    }

    try {
        var sourceFiles = getFilesByExtensions(sourceFolder, direction.sourceExtensions);
        var targetIndex = buildFileIndex(targetFolder, direction.targetExtensions);

        syncRatings(sourceFiles, targetIndex, direction, function (result) {
            result.sourceFolder = sourceFolder;
            result.targetFolder = targetFolder;
            showResult(result);
        });
    } catch (error) {
        alert("処理を続行できないエラーが発生しました。\n\n" + getErrorMessage(error));
    }
}

function selectSourceFolder(direction) {
    return selectFolder(direction.sourcePrompt, getCurrentBridgeFolder());
}

function selectTargetFolder(direction, sourceFolder) {
    var startFolder = getCurrentBridgeFolder();

    if (startFolder == null) {
        try {
            if (sourceFolder != null && sourceFolder.parent != null) {
                startFolder = sourceFolder.parent;
            }
        } catch (error) {
            startFolder = null;
        }
    }

    return selectFolder(direction.targetPrompt, startFolder);
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

function getFilesByExtensions(folder, extensions) {
    var files = folder.getFiles(function (item) {
        return item instanceof File && isExtensionAllowed(getExtension(item.name), extensions);
    });

    if (files == null) {
        return [];
    }

    return sortFilesByName(files);
}

function buildFileIndex(folder, extensions) {
    var files = folder.getFiles(function (item) {
        return item instanceof File && isExtensionAllowed(getExtension(item.name), extensions);
    });
    var index = {};
    var i;
    var file;
    var key;

    if (files == null) {
        return index;
    }

    files = sortFilesByName(files);

    for (i = 0; i < files.length; i++) {
        file = files[i];
        key = getIndexKey(file.name);

        if (!index[key]) {
            index[key] = [];
        }

        index[key].push(file);
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

function syncRatings(sourceFiles, targetIndex, direction, onComplete) {
    var result = createResult(sourceFiles.length, direction);
    var session;
    var sessionId;

    if (!canScheduleTasks()) {
        syncRatingsSynchronously(sourceFiles, targetIndex, result);
        onComplete(result);
        return;
    }

    sessionId = "ratingSync" + (++SYNC_JPG_RATING_TO_RAW_SESSION_ID);
    session = {
        id: sessionId,
        cursor: 0,
        activeWorkers: 0,
        sourceFiles: sourceFiles,
        targetIndex: targetIndex,
        result: result,
        onComplete: onComplete
    };
    SYNC_JPG_RATING_TO_RAW_SESSIONS[sessionId] = session;
    startRatingSyncWorkers(session);
}

function canScheduleTasks() {
    return typeof app != "undefined" && app != null && typeof app.scheduleTask == "function";
}

function startRatingSyncWorkers(session) {
    var workerCount = Math.min(SYNC_JPG_RATING_TO_RAW_CONFIG.parallelWorkers, session.sourceFiles.length);
    var i;

    if (workerCount <= 0) {
        finishRatingSyncSession(session);
        return;
    }

    for (i = 0; i < workerCount; i++) {
        session.activeWorkers++;
        scheduleRatingSyncWorker(session.id);
    }
}

function scheduleRatingSyncWorker(sessionId) {
    app.scheduleTask("processRatingSyncWorker('" + sessionId + "')", 1, false);
}

function processRatingSyncWorker(sessionId) {
    var session = SYNC_JPG_RATING_TO_RAW_SESSIONS[sessionId];
    var processedCount = 0;
    var sourceFile;

    if (session == null) {
        return;
    }

    while (session.cursor < session.sourceFiles.length && processedCount < SYNC_JPG_RATING_TO_RAW_CONFIG.workerBatchSize) {
        sourceFile = session.sourceFiles[session.cursor];
        session.cursor++;
        processedCount++;
        processRatingSyncFile(sourceFile, session.targetIndex, session.result);
    }

    if (session.cursor < session.sourceFiles.length) {
        scheduleRatingSyncWorker(session.id);
        return;
    }

    session.activeWorkers--;

    if (session.activeWorkers <= 0) {
        finishRatingSyncSession(session);
    }
}

function finishRatingSyncSession(session) {
    var onComplete = session.onComplete;

    delete SYNC_JPG_RATING_TO_RAW_SESSIONS[session.id];
    onComplete(session.result);
}

function syncRatingsSynchronously(sourceFiles, targetIndex, result) {
    var i;

    for (i = 0; i < sourceFiles.length; i++) {
        processRatingSyncFile(sourceFiles[i], targetIndex, result);
    }
}

function processRatingSyncFile(sourceFile, targetIndex, result) {
    var key;
    var targetCandidates;
    var targetFile;
    var sourceRating;
    var targetRating;

    key = getIndexKey(sourceFile.name);
    targetCandidates = targetIndex[key];

    if (targetCandidates == null || targetCandidates.length == 0) {
        result.notFoundCount++;
        addReportItem(result.notFoundFiles, getDisplayName(sourceFile));
        return;
    }

    if (targetCandidates.length > 1) {
        result.multipleCount++;
        addReportItem(
            result.multipleFiles,
            getDisplayName(sourceFile) + " -> " + joinFileNames(targetCandidates)
        );
        return;
    }

    targetFile = targetCandidates[0];

    try {
        sourceRating = getThumbnailRating(new Thumbnail(sourceFile));
        targetRating = getThumbnailRating(new Thumbnail(targetFile));

        if (sourceRating == targetRating) {
            result.skippedSameRatingCount++;
            return;
        }

        setThumbnailRating(new Thumbnail(targetFile), sourceRating);
        result.updatedCount++;
    } catch (error) {
        result.errorCount++;
        addReportItem(
            result.errorFiles,
            getDisplayName(sourceFile) + " -> " + getDisplayName(targetFile) + ": " + getErrorMessage(error)
        );
    }
}

function showResult(result) {
    var lines = [];

    lines.push(result.completionLabel + "が完了しました。");
    lines.push("");
    lines.push("同期元 " + result.sourceLabel + " フォルダ: " + getFolderName(result.sourceFolder));
    lines.push("同期先 " + result.targetLabel + " フォルダ: " + getFolderName(result.targetFolder));
    lines.push("");
    lines.push(result.sourceLabel + "対象ファイル数: " + result.sourceCount);
    lines.push("更新件数: " + result.updatedCount);
    lines.push("同一レーティングのため更新しなかった件数: " + result.skippedSameRatingCount);
    lines.push(result.targetLabel + "が見つからなかった件数: " + result.notFoundCount);
    lines.push("複数" + result.targetLabel + "候補のためスキップした件数: " + result.multipleCount);
    lines.push("エラー件数: " + result.errorCount);

    appendReportSection(lines, result.targetLabel + "が見つからなかったファイル", result.notFoundFiles, result.notFoundCount);
    appendReportSection(lines, "複数" + result.targetLabel + "候補のためスキップしたファイル", result.multipleFiles, result.multipleCount);
    appendReportSection(lines, "エラーが発生したファイル", result.errorFiles, result.errorCount);

    alert(lines.join("\n"));
}

function createResult(sourceCount, direction) {
    return {
        completionLabel: direction.completionLabel,
        sourceLabel: direction.sourceLabel,
        targetLabel: direction.targetLabel,
        sourceCount: sourceCount,
        updatedCount: 0,
        skippedSameRatingCount: 0,
        notFoundCount: 0,
        multipleCount: 0,
        errorCount: 0,
        notFoundFiles: [],
        multipleFiles: [],
        errorFiles: [],
        sourceFolder: null,
        targetFolder: null
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
    // rating が 0 の場合も代入します。0 は「未評価」であり同期対象です。
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
