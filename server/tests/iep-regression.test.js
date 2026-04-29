// =============================================================================
// iep-regression.test.js — Phase 5 regression scaffolding for the IEP generator.
//
// Run with:  node tests/iep-regression.test.js
//
// What this file does:
//   1. CASCADE REPRODUCER. Drives the existing planAlgorithm.createPlan with a
//      fixture (server/tests/fixtures/cascade-reproducer.json) that triggers the
//      "placeholder cascade" bug — a freely-placeable later row gets trapped
//      behind an unresolvable prereq and is never scheduled. Asserts the row
//      IS placed; today this assertion FAILS on main. Marked xfail so the test
//      script exits 0. After Phase 6 fixes the algorithm, this test should
//      pass — at which point the runner will report XPASS and the xfail flag
//      can be flipped.
//
//   2. CONTRACT TESTS. Five fixtures encoding the M2 generator's expected
//      behavior (level chain, summer on/off, elective-default resolution,
//      skip-then-retry, credit reconciliation). They target a generator
//      module that does not exist yet (../services/IEPGeneratorService.js).
//      Until Phase 6 creates it, every contract test is XFAIL because the
//      require throws.
//
// Status legend:
//   PASS   — passed and was expected to pass
//   FAIL   — failed and was expected to pass            (real regression)
//   XFAIL  — failed and was expected to fail            (no action)
//   XPASS  — passed and was expected to fail            (flip xfail!)
//
// Exit code: 0 if every test is PASS or XFAIL. Nonzero otherwise.
// =============================================================================

const path   = require('path');
const fs     = require('fs');
const assert = require('assert');

const { createPlan } = require('../algorithm/planAlgorithm');

// Try to load the future Phase 6 generator. If absent, contract tests xfail.
let iepGenerator = null;
let generatorLoadError = null;
try {
    iepGenerator = require('../services/IEPGeneratorService');
} catch (err) {
    generatorLoadError = err.message.split('\n')[0];
}

// -----------------------------------------------------------------------------
// Test harness
// -----------------------------------------------------------------------------

const results = [];

function run(name, fn, { xfail = false, reason = '' } = {}) {
    let status;
    let detail = '';
    try {
        fn();
        status = xfail ? 'XPASS' : 'PASS';
    } catch (e) {
        status = xfail ? 'XFAIL' : 'FAIL';
        detail = e.message;
    }
    results.push({ name, status, detail, reason });
    const icon  = { PASS: '✓', FAIL: '✗', XFAIL: '⊘', XPASS: '!' }[status];
    const tail  = detail ? `  — ${detail}` : (reason ? `  — ${reason}` : '');
    console.log(`  ${icon}  [${status}] ${name}${tail}`);
}

function loadFixture(name) {
    const file = path.join(__dirname, 'fixtures', name);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const xfailReason = iepGenerator
    ? ''
    : `IEPGeneratorService not loaded: ${generatorLoadError}`;

function requireGenerator() {
    if (!iepGenerator) throw new Error(xfailReason);
    if (typeof iepGenerator.generate !== 'function') {
        throw new Error('IEPGeneratorService.generate() not implemented');
    }
}

// -----------------------------------------------------------------------------
// 1. Cascade reproducer (Phase 6 IEPGeneratorService)
//
// Originally tested the legacy createPlan with old-shape input — the bug was
// in that function. After Phase 6, the test routes through the new generator
// with a new-shape fixture and asserts that the freely-placeable later row
// is no longer trapped, and that the unresolvable rows surface as explicit
// unresolved slots instead of silent Student Elective placeholders.
// -----------------------------------------------------------------------------

console.log('Cascade reproducer (Phase 6 IEPGeneratorService):');

run('freely-placeable row E is scheduled even when later rows have unresolvable prereqs', () => {
    requireGenerator();
    const fix = loadFixture('cascade-reproducer.json');
    const result = iepGenerator.generate(fix.input);

    const allCourses = (result.semesters || []).flatMap(s => s.courses);
    const placedIds  = allCourses.filter(c => !c.is_unresolved).map(c => c.course_id);
    const unresolved = allCourses.filter(c => c.is_unresolved).map(c => c.source_row_priority);

    for (const id of fix.expectations.must_be_placed) {
        assert(placedIds.includes(id),
            `${id} must be placed (got [${placedIds.join(', ')}])`);
    }

    // C is priority 3, D is priority 4 in the fixture.
    assert(unresolved.includes(3), 'C (priority 3) must surface as an unresolved slot');
    assert(unresolved.includes(4), 'D (priority 4) must surface as an unresolved slot');

    // No silent Student Elective placeholders — every elective placement
    // must declare resolution_source explicitly.
    const silent = allCourses.filter(c => c.course_id === null && !c.is_unresolved);
    assert.strictEqual(silent.length, 0, 'no silent placeholders allowed');
}, { xfail: !iepGenerator, reason: xfailReason });

// -----------------------------------------------------------------------------
// 2. Contract tests (Phase 6 IEPGeneratorService)
// -----------------------------------------------------------------------------

console.log('\nContract tests (Phase 6 IEPGeneratorService):');

run('level chain L1→L2→L3 places one course per semester', () => {
    requireGenerator();
    const fix = loadFixture('level-chain.json');
    const result = iepGenerator.generate(fix.input);
    for (const exp of fix.expectations.placements) {
        const placed = (result.semesters || []).find(s =>
            s.courses.some(c => c.course_id === exp.course_id)
        );
        assert(placed, `${exp.course_id} must be placed somewhere`);
        assert.strictEqual(placed.semester_number, exp.semester,
            `${exp.course_id} expected in semester ${exp.semester}, got ${placed.semester_number}`);
    }
}, { xfail: !iepGenerator, reason: xfailReason });

run('summer on/off produces different term sequences', () => {
    requireGenerator();
    const fix = loadFixture('summer-on-vs-off.json');
    for (const variantName of ['summer_off', 'summer_on']) {
        const input = {
            programModel:     fix.input.programModel,
            studentProfile:   fix.input.variants[variantName].studentProfile,
            completedCourses: fix.input.completedCourses,
        };
        const result = iepGenerator.generate(input);
        const terms  = (result.semesters || []).map(s => s.term_code);
        const exp    = fix.expectations[variantName].term_codes_in_order;
        assert.deepStrictEqual(terms, exp,
            `${variantName}: terms ${JSON.stringify(terms)} != ${JSON.stringify(exp)}`);
    }
}, { xfail: !iepGenerator, reason: xfailReason });

run('elective slot resolves to default_course_id when no override', () => {
    requireGenerator();
    const fix = loadFixture('elective-default.json');
    const result = iepGenerator.generate(fix.input);

    const electiveSlot = (result.semesters || [])
        .flatMap(s => s.courses)
        .find(c => c.is_elective);

    assert(electiveSlot, 'elective slot must be placed');
    assert.strictEqual(electiveSlot.course_id,         fix.expectations.elective_placement.course_id);
    assert.strictEqual(electiveSlot.resolution_source, fix.expectations.elective_placement.resolution_source);
    assert.strictEqual(electiveSlot.is_elective,       true);

    // Phase 8 — placement must carry source_row_id back to the program_model_row
    // so the GET response and PATCH endpoint can reference it.
    assert.strictEqual(
        electiveSlot.source_row_id,
        '00000000-0000-0000-0000-000000000004',
        'elective placement must carry the source row id'
    );

    const unresolved = (result.semesters || [])
        .flatMap(s => s.courses)
        .filter(c => c.is_unresolved);
    assert.strictEqual(unresolved.length, 0, 'no slots should be unresolved');
}, { xfail: !iepGenerator, reason: xfailReason });

run('student elective override produces resolution_source = elective_chosen', () => {
    requireGenerator();
    const fix = loadFixture('elective-default.json');
    const electiveRow = fix.input.programModel.rows.find(r => r.is_elective);
    const overriddenInput = {
        ...fix.input,
        studentProfile: {
            ...fix.input.studentProfile,
            elective_overrides: { [electiveRow.priority]: 'ELEC_ALT_A' },
        },
    };
    const result = iepGenerator.generate(overriddenInput);
    const placed = (result.semesters || [])
        .flatMap(s => s.courses)
        .find(c => c.is_elective);
    assert(placed,                             'elective placement must exist');
    assert.strictEqual(placed.course_id,         'ELEC_ALT_A',      'override course must be placed');
    assert.strictEqual(placed.resolution_source, 'elective_chosen', 'resolution_source must reflect override');
}, { xfail: !iepGenerator, reason: xfailReason });

run('skipped row in semester 1 is retried in semester 2', () => {
    requireGenerator();
    const fix = loadFixture('skipped-row-retry.json');
    const result = iepGenerator.generate(fix.input);
    for (const exp of fix.expectations.placements) {
        const sem = (result.semesters || []).find(s =>
            s.courses.some(c => c.course_id === exp.course_id)
        );
        assert(sem, `${exp.course_id} must be placed`);
        assert.strictEqual(sem.semester_number, exp.semester,
            `${exp.course_id} expected in semester ${exp.semester}`);
    }
}, { xfail: !iepGenerator, reason: xfailReason });

run('total scheduled credits equals program total_credits_required', () => {
    requireGenerator();
    const fix = loadFixture('credit-total.json');
    const result = iepGenerator.generate(fix.input);

    const total = (result.semesters || [])
        .flatMap(s => s.courses)
        .filter(c => !c.is_unresolved)
        .reduce((sum, c) => sum + (c.credits || 0), 0);

    assert.strictEqual(total, fix.expectations.scheduled_credit_total,
        `expected ${fix.expectations.scheduled_credit_total} credits, got ${total}`);
}, { xfail: !iepGenerator, reason: xfailReason });

// -----------------------------------------------------------------------------
// 3. IEPNoteEmitter unit tests (Phase 7)
// -----------------------------------------------------------------------------

console.log('\nIEPNoteEmitter (Phase 7):');

let emitNotes = null;
try { ({ emitNotes } = require('../services/IEPNoteEmitter')); } catch (_) {}

run('COURSE_COUNT_MISMATCH fires when scheduled != target', () => {
    if (!emitNotes) throw new Error('IEPNoteEmitter not loaded');
    const notes = emitNotes(
        { term_type: 'fall', scheduled_courses: 2, scheduled_credits: 12 },
        { target_courses: 3, target_credits: 12 }
    );
    const note = notes.find(n => n.code === 'COURSE_COUNT_MISMATCH');
    assert(note, 'COURSE_COUNT_MISMATCH must be emitted');
    assert.strictEqual(note.severity, 'warning');
}, { xfail: !emitNotes, reason: emitNotes ? '' : 'IEPNoteEmitter not yet implemented' });

run('BELOW_CREDIT_TARGET + FINANCIAL_AID_PART_TIME_FALL_SPRING fire together at 9 credits in Fall', () => {
    if (!emitNotes) throw new Error('IEPNoteEmitter not loaded');
    const notes = emitNotes(
        { term_type: 'fall', scheduled_courses: 3, scheduled_credits: 9 },
        { target_courses: 3, target_credits: 12 }
    );
    const codes = notes.map(n => n.code);
    assert(codes.includes('BELOW_CREDIT_TARGET'),                    'BELOW_CREDIT_TARGET expected');
    assert(codes.includes('FINANCIAL_AID_PART_TIME_FALL_SPRING'),    'FINANCIAL_AID_PART_TIME_FALL_SPRING expected');
}, { xfail: !emitNotes, reason: emitNotes ? '' : 'IEPNoteEmitter not yet implemented' });

run('financial-aid notes are always severity=info, never warning', () => {
    if (!emitNotes) throw new Error('IEPNoteEmitter not loaded');
    const fall = emitNotes(
        { term_type: 'fall', scheduled_courses: 3, scheduled_credits: 6 },
        { target_courses: 3, target_credits: 12 }
    );
    const summer = emitNotes(
        { term_type: 'summer', scheduled_courses: 1, scheduled_credits: 3 },
        { target_courses: 1, target_credits: 3 }
    );
    const aid = [...fall, ...summer].filter(n => n.code.startsWith('FINANCIAL_AID_'));
    assert(aid.length >= 2, 'expected at least one fall and one summer aid note');
    for (const n of aid) {
        assert.strictEqual(n.severity, 'info', `${n.code} must be info, was ${n.severity}`);
    }
}, { xfail: !emitNotes, reason: emitNotes ? '' : 'IEPNoteEmitter not yet implemented' });

run('unresolved synthetic semester emits no notes', () => {
    if (!emitNotes) throw new Error('IEPNoteEmitter not loaded');
    const notes = emitNotes(
        { term_type: 'unresolved', scheduled_courses: 0, scheduled_credits: 0 },
        { target_courses: 0, target_credits: 0 }
    );
    assert.strictEqual(notes.length, 0, 'unresolved semester must not emit notes');
}, { xfail: !emitNotes, reason: emitNotes ? '' : 'IEPNoteEmitter not yet implemented' });

// -----------------------------------------------------------------------------
// 4. Program Model row-edit validation (Phase 10)
// -----------------------------------------------------------------------------

console.log('\nProgramModelEditor validation (Phase 10):');

let validateRowPatch = null;
try { ({ validateRowPatch } = require('../routes/programModels')); } catch (_) {}

const baseRow = {
    id: 'row-uuid',
    program_model_id: 'model-uuid',
    priority: 5,
    course_id: 'COP1047C',
    category: 'MAJOR',
    level: 1,
    is_elective: false,
    default_course_id: null,
    allowed_course_ids: null,
    term_length: 'FULL_16_WEEK',
    offered_in_summer: true,
};

run('valid edit returns merged next state', () => {
    if (!validateRowPatch) throw new Error('validateRowPatch not loaded');
    const { error, next } = validateRowPatch(baseRow, { level: 2 }, new Set([1, 2, 3]));
    assert.strictEqual(error, undefined);
    assert.strictEqual(next.level,    2);
    assert.strictEqual(next.priority, 5, 'unmodified fields preserved');
}, { xfail: !validateRowPatch });

run('duplicate priority returns 409 with clear message', () => {
    if (!validateRowPatch) throw new Error('validateRowPatch not loaded');
    const { error } = validateRowPatch(baseRow, { priority: 7 }, new Set([1, 7, 9]));
    assert(error,                              'expected error');
    assert.strictEqual(error.status, 409);
    assert(/Priority 7 already in use/.test(error.message),
        `message should mention the priority — got: ${error.message}`);
}, { xfail: !validateRowPatch });

run('elective with default not in allowed returns 400', () => {
    if (!validateRowPatch) throw new Error('validateRowPatch not loaded');
    const { error } = validateRowPatch(baseRow, {
        is_elective:        true,
        default_course_id:  'GEB1432',
        allowed_course_ids: ['HSC2060', 'CTS1145'],
    }, new Set());
    assert(error,                              'expected error');
    assert.strictEqual(error.status, 400);
    assert(/default_course_id/.test(error.message));
}, { xfail: !validateRowPatch });

run('elective with default in allowed passes', () => {
    if (!validateRowPatch) throw new Error('validateRowPatch not loaded');
    const { error, next } = validateRowPatch(baseRow, {
        is_elective:        true,
        default_course_id:  'GEB1432',
        allowed_course_ids: ['GEB1432', 'HSC2060'],
    }, new Set());
    assert.strictEqual(error, undefined);
    assert.strictEqual(next.is_elective, true);
}, { xfail: !validateRowPatch });

run('keeping the same priority does not flag conflict', () => {
    if (!validateRowPatch) throw new Error('validateRowPatch not loaded');
    const { error } = validateRowPatch(baseRow, { level: 3 }, new Set([5, 6])); // 5 = baseRow.priority
    assert.strictEqual(error, undefined, 'should not conflict with own priority');
}, { xfail: !validateRowPatch });

run('invalid term_length returns 400', () => {
    if (!validateRowPatch) throw new Error('validateRowPatch not loaded');
    const { error } = validateRowPatch(baseRow, { term_length: 'WEEKEND' }, new Set());
    assert(error);
    assert.strictEqual(error.status, 400);
}, { xfail: !validateRowPatch });

// -----------------------------------------------------------------------------
// 5. Prereq-filter helpers (Phase 11)
// -----------------------------------------------------------------------------

console.log('\nPrereq filter (Phase 11):');

let prereqFilter = null;
try { prereqFilter = require('../services/prereqFilter'); } catch (_) {}

run('buildKnownPrereqIds includes required course_ids and elective defaults', () => {
    if (!prereqFilter) throw new Error('prereqFilter not loaded');
    const rows = [
        { course_id: 'A', is_elective: false },
        { course_id: 'B', is_elective: false },
        { course_id: null, is_elective: true, default_course_id: 'D', allowed_course_ids: ['D', 'E', 'F'] },
    ];
    const ids = prereqFilter.buildKnownPrereqIds(rows, []);
    assert(ids.has('A'));
    assert(ids.has('B'));
    assert(ids.has('D'),  'elective default counts');
    assert(!ids.has('E'), 'allowed-but-not-default does NOT count');
    assert(!ids.has('F'), 'allowed-but-not-default does NOT count');
}, { xfail: !prereqFilter });

run('buildKnownPrereqIds includes completed courses (string + object form)', () => {
    if (!prereqFilter) throw new Error('prereqFilter not loaded');
    const ids = prereqFilter.buildKnownPrereqIds([], ['X', { course_id: 'Y' }]);
    assert(ids.has('X'));
    assert(ids.has('Y'));
}, { xfail: !prereqFilter });

run('filterPrereqsAndCollectDrops mutates rows and returns drop list', () => {
    if (!prereqFilter) throw new Error('prereqFilter not loaded');
    const rows = [
        { id: 'r1', course_id: 'A', prerequisites: [] },
        { id: 'r2', course_id: 'B', prerequisites: ['A'] },
        { id: 'r3', course_id: 'C', prerequisites: ['A', 'OUT_OF_SCOPE'] },
    ];
    const known = new Set(['A', 'B', 'C']);
    const drops = prereqFilter.filterPrereqsAndCollectDrops(rows, known);
    assert.deepStrictEqual(rows[0].prerequisites, []);
    assert.deepStrictEqual(rows[1].prerequisites, ['A']);
    assert.deepStrictEqual(rows[2].prerequisites, ['A'], 'OUT_OF_SCOPE was filtered');
    assert.strictEqual(drops.length, 1);
    assert.strictEqual(drops[0].source_row_id, 'r3');
    assert.strictEqual(drops[0].course_id,     'C');
    assert.deepStrictEqual(drops[0].dropped,   ['OUT_OF_SCOPE']);
}, { xfail: !prereqFilter });

run('CIS3360-style scenario: alternate-prereq is dropped, row keeps required prereq', () => {
    if (!prereqFilter) throw new Error('prereqFilter not loaded');
    // Mirrors Maria's BS-ISTS plan: CTS1134 is required, CTS1650 is only in
    // an elective's allowed list, CIS3360 has prereq CTS1134,CTS1650.
    const rows = [
        { id: 'r-cts1134', course_id: 'CTS1134', prerequisites: [] },
        { id: 'r-cis3360', course_id: 'CIS3360', prerequisites: ['CTS1134', 'CTS1650'] },
        { id: 'r-elective', course_id: null, is_elective: true,
          default_course_id: 'CIS4347',
          allowed_course_ids: ['CIS4347', 'CTS1650'] },
    ];
    const known = prereqFilter.buildKnownPrereqIds(rows, []);
    const drops = prereqFilter.filterPrereqsAndCollectDrops(rows, known);
    assert.deepStrictEqual(rows[1].prerequisites, ['CTS1134']);
    assert.strictEqual(drops.length, 1);
    assert.strictEqual(drops[0].course_id, 'CIS3360');
    assert.deepStrictEqual(drops[0].dropped, ['CTS1650']);
}, { xfail: !prereqFilter });

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

const counts = results.reduce((acc, r) => (acc[r.status] = (acc[r.status] || 0) + 1, acc), {});
const ordered = ['PASS', 'XFAIL', 'XPASS', 'FAIL'];
const summary = ordered
    .filter(s => counts[s])
    .map(s => `${counts[s]} ${s}`)
    .join(', ');

console.log(`\n${results.length} tests — ${summary}`);

if (counts.XPASS) {
    console.log('  ! XPASS means a test that was expected to fail is now passing.');
    console.log('    Flip its xfail flag to lock the new correct behavior in.');
}
if (counts.FAIL) {
    console.log('  ✗ FAIL means a real regression. Investigate before merging.');
}

const ok = !counts.FAIL && !counts.XPASS;
process.exit(ok ? 0 : 1);
