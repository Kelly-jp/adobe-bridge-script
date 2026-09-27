const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require('node:path').join(__dirname, '../sync-jpg-rating-to-raw.jsx'), 'utf8').replace(/^#target bridge\s*/, '');

function setup(scheduled = true) {
    const queue = [], alerts = [], writes = [], thumbnails = [];
    function File(name, rating) { this.name = name; this.value = rating; }
    function Folder() {}
    function Thumbnail(file) {
        thumbnails.push(file);
        Object.defineProperty(this, 'rating', {
            get() { if (file.readError) throw new Error('read failed'); return file.value; },
            set(value) { if (file.writeError) throw new Error('write failed'); writes.push([file.name, value]); file.value = value; }
        });
        Object.defineProperty(this, 'synchronousMetadata', {
            get() { if (file.metadataError) throw new Error('metadata failed'); return file.metadata; }
        });
    }
    const context = vm.createContext({ File, Folder, Thumbnail, BridgeTalk: { appName: 'test' }, app: {}, alert: value => alerts.push(value) });
    if (scheduled) context.app.scheduleTask = body => queue.push(body);
    vm.runInContext(script, context);
    context.BridgeTalk.appName = 'bridge';
    function run(source, target) {
        context.selectSourceFolder = () => ({ getFiles: filter => source.filter(filter) });
        context.selectTargetFolder = () => ({ getFiles: filter => target.filter(filter) });
        context.main(context.createSyncDirection('jpgToRaw'));
    }
    function drain() { while (queue.length) { assert.equal(queue.length, 1); vm.runInContext(queue.shift(), context); } }
    return { context, File, queue, alerts, writes, thumbnails, run, drain };
}

test('single queued batch, cross-direction lock, thumbnail reuse and rerun', () => {
    const h = setup();
    const source = Array.from({ length: 19 }, (_, i) => new h.File(`${i}.jpg`, 3));
    const target = source.map((_, i) => new h.File(`${i}.raf`, 0));
    h.run(source, target);
    assert.equal(h.queue.length, 1);
    h.context.main(h.context.createSyncDirection('rawToJpg'));
    assert.match(h.alerts[0], /実行中/);
    assert.equal(h.queue.length, 1);
    h.drain();
    assert.equal(h.writes.length, 19);
    assert.equal(h.thumbnails.length, 38);
    assert.equal(h.context.SYNC_JPG_RATING_TO_RAW_RUNNING, false);
    assert.equal(Object.keys(h.context.SYNC_JPG_RATING_TO_RAW_SESSIONS).length, 0);
    h.run(source, target); h.drain();
    assert.equal(h.writes.length, 19);
    assert.match(h.alerts.at(-1), /同一レーティングのため更新しなかった件数: 19/);
});

for (const scheduled of [false, true]) {
    test(`results and per-file failures (scheduled=${scheduled})`, () => {
        const h = setup(scheduled);
        const source = ['zero', 'same', 'missing', 'duplicate', 'read', 'metadata', 'write', 'last'].map(name => new h.File(`${name}.JPG`, name === 'zero' ? 0 : 4));
        source[4].readError = true;
        source[5].value = undefined; source[5].metadataError = true;
        const target = ['zero', 'same', 'duplicate', 'duplicate', 'read', 'metadata', 'write', 'last'].map((name, i) => new h.File(`${name}.${i === 3 ? 'dng' : 'RAF'}`, name === 'same' ? 4 : 2));
        target[6].writeError = true;
        h.run(source, target); h.drain();
        assert.deepEqual(h.writes, [['last.RAF', 4], ['zero.RAF', 0]]);
        const result = h.alerts.at(-1);
        for (const text of ['更新件数: 2', '同一レーティングのため更新しなかった件数: 1', '見つからなかった件数: 1', 'スキップした件数: 1', 'エラー件数: 3']) assert.ok(result.includes(text), text);
        assert.equal(h.context.SYNC_JPG_RATING_TO_RAW_RUNNING, false);
    });
}

test('cancellation and initial scheduling failure release lock', () => {
    const h = setup();
    h.context.selectSourceFolder = () => null;
    h.context.main(h.context.createSyncDirection('jpgToRaw'));
    assert.equal(h.context.SYNC_JPG_RATING_TO_RAW_RUNNING, false);
    h.context.app.scheduleTask = () => { throw new Error('schedule failed'); };
    h.run([new h.File('a.jpg', 3)], [new h.File('a.raf', 0)]);
    assert.match(h.alerts.at(-1), /schedule failed/);
    assert.equal(h.context.SYNC_JPG_RATING_TO_RAW_RUNNING, false);
    assert.equal(Object.keys(h.context.SYNC_JPG_RATING_TO_RAW_SESSIONS).length, 0);
});

test('rescheduling failure keeps completed writes and permits retry', () => {
    const h = setup();
    const source = Array.from({ length: 9 }, (_, i) => new h.File(`${i}.jpg`, 5));
    const target = source.map((_, i) => new h.File(`${i}.raf`, 0));
    h.run(source, target);
    h.context.app.scheduleTask = () => { throw new Error('schedule failed'); };
    h.drain();
    assert.equal(h.writes.length, 8);
    assert.match(h.alerts.at(-1), /中断/);
    assert.equal(h.context.SYNC_JPG_RATING_TO_RAW_RUNNING, false);
    assert.equal(Object.keys(h.context.SYNC_JPG_RATING_TO_RAW_SESSIONS).length, 0);
});

test('empty input completes without scheduling', () => {
    const h = setup(); h.run([], []);
    assert.equal(h.queue.length, 0);
    assert.match(h.alerts.at(-1), /対象ファイル数: 0/);
    assert.equal(h.context.SYNC_JPG_RATING_TO_RAW_RUNNING, false);
});

test('target cancellation releases lock and metadata fallback supports reverse sync', () => {
    const h = setup();
    h.context.selectSourceFolder = () => ({});
    h.context.selectTargetFolder = () => null;
    h.context.main(h.context.createSyncDirection('rawToJpg'));
    assert.equal(h.context.SYNC_JPG_RATING_TO_RAW_RUNNING, false);
    const raw = new h.File('a.RAF', undefined); raw.metadata = { Rating: '5' };
    const jpg = new h.File('A.jpeg', 0);
    h.context.selectSourceFolder = () => ({ getFiles: filter => [raw].filter(filter) });
    h.context.selectTargetFolder = () => ({ getFiles: filter => [jpg].filter(filter) });
    h.context.main(h.context.createSyncDirection('rawToJpg')); h.drain();
    assert.deepEqual(h.writes, [['A.jpeg', 5]]);
});

test('missing metadata is an error while an absent Rating property is unrated', () => {
    const h = setup(false);
    const broken = new h.File('broken.jpg', undefined);
    const unrated = new h.File('unrated.jpg', undefined); unrated.metadata = {};
    h.run([broken, unrated], [new h.File('broken.raf', 5), new h.File('unrated.raf', 5)]);
    assert.deepEqual(h.writes, [['unrated.raf', 0]]);
    assert.match(h.alerts.at(-1), /エラー件数: 1/);
});
