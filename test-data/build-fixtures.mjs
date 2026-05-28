// Generate the synthetic XER baseline + revised fixtures used by the diff
// engine unit tests and for manual UI testing. The two files differ in a
// controlled way:
//
//   * adds activity A1015 (Design HVAC) in the DESIGN phase
//   * removes activity A2020 (Install Roof)
//   * renames A2000 and shifts its planned start by 5 days, ups duration
//   * advances A3000 from Not Started to In Progress @ 25 %
//   * adds 8 hr lag on A1010 -> A1020
//   * adds relationship A1015 -> A2000 and A2010 -> A3000
//   * removes relationship A2020 -> A3000
//   * shifts the project data date forward by 14 days
//
// These deltas are what the diff engine tests assert against.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const NL = '\r\n';
const TAB = '\t';

function table(name, fields, rows) {
  const lines = [];
  lines.push(`%T${TAB}${name}`);
  lines.push(`%F${TAB}${fields.join(TAB)}`);
  for (const r of rows) {
    const cells = fields.map(f => formatCell(r[f]));
    lines.push(`%R${TAB}${cells.join(TAB)}`);
  }
  return lines.join(NL);
}

function formatCell(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

function buildXer({ dataDate, planStart, planFinish, activities, relationships }) {
  const header =
    `ERMHDR${TAB}23.12${TAB}2026-04-01${TAB}Project${TAB}admin${TAB}Admin User` +
    `${TAB}dbxDatabaseNoName${TAB}Project Management${TAB}USD`;

  const sections = [];

  sections.push(table(
    'CURRTYPE',
    ['curr_id', 'decimal_digit_cnt', 'curr_symbol', 'decimal_symbol',
     'digit_group_symbol', 'pos_curr_fmt_type', 'neg_curr_fmt_type',
     'decimal_symbol_type', 'digit_group_symbol_type', 'digit_group_cnt',
     'curr_type', 'curr_short_name', 'group_cnt'],
    [{
      curr_id: 1, decimal_digit_cnt: 2, curr_symbol: '$', decimal_symbol: '.',
      digit_group_symbol: ',', pos_curr_fmt_type: '#1.1', neg_curr_fmt_type: '(#1.1)',
      decimal_symbol_type: 'PERIOD', digit_group_symbol_type: 'COMMA',
      digit_group_cnt: 3, curr_type: 'US Dollar', curr_short_name: 'USD', group_cnt: 3
    }]
  ));

  sections.push(table(
    'CALENDAR',
    ['clndr_id', 'default_flag', 'clndr_name', 'proj_id', 'base_clndr_id',
     'last_chng_date', 'clndr_type', 'day_hr_cnt', 'week_hr_cnt',
     'month_hr_cnt', 'year_hr_cnt', 'rsrc_private', 'clndr_data'],
    [
      { clndr_id: 1, default_flag: 'Y', clndr_name: 'Standard 5x8',
        proj_id: 1, base_clndr_id: '', last_chng_date: '2026-04-01 00:00',
        clndr_type: 'CA_Base', day_hr_cnt: 8, week_hr_cnt: 40,
        month_hr_cnt: 172, year_hr_cnt: 2000, rsrc_private: 'N', clndr_data: '' },
      { clndr_id: 2, default_flag: 'N', clndr_name: '24x7',
        proj_id: 1, base_clndr_id: '', last_chng_date: '2026-04-01 00:00',
        clndr_type: 'CA_Base', day_hr_cnt: 24, week_hr_cnt: 168,
        month_hr_cnt: 720, year_hr_cnt: 8760, rsrc_private: 'N', clndr_data: '' }
    ]
  ));

  sections.push(table(
    'PROJECT',
    ['proj_id', 'fy_start_month_num', 'rsrc_self_add_flag', 'allow_complete_flag',
     'rsrc_multi_assign_flag', 'checkout_flag', 'project_flag', 'step_complete_flag',
     'cost_qty_recalc_flag', 'batch_sum_flag', 'name_sep_char', 'def_complete_pct_type',
     'proj_short_name', 'acct_id', 'orig_proj_id', 'source_proj_id', 'base_type_id',
     'clndr_id', 'sum_base_proj_id', 'task_code_base', 'task_code_step', 'priority_num',
     'wbs_max_sum_level', 'strgy_priority_num', 'last_checksum', 'critical_drtn_hr_cnt',
     'def_cost_per_hr', 'last_recalc_date', 'plan_start_date', 'plan_end_date',
     'scd_end_date', 'add_date', 'last_tasksum_date', 'fcst_start_date',
     'def_duration_type', 'task_code_prefix', 'guid', 'def_qty_type', 'add_by_name'],
    [{
      proj_id: 1, fy_start_month_num: 1, rsrc_self_add_flag: 'N',
      allow_complete_flag: 'Y', rsrc_multi_assign_flag: 'N', checkout_flag: 'N',
      project_flag: 'Y', step_complete_flag: 'N', cost_qty_recalc_flag: 'Y',
      batch_sum_flag: 'N', name_sep_char: 46, def_complete_pct_type: 'CP_Drtn',
      proj_short_name: 'P1', acct_id: '', orig_proj_id: '', source_proj_id: '',
      base_type_id: '', clndr_id: 1, sum_base_proj_id: '', task_code_base: 'A',
      task_code_step: 10, priority_num: 10, wbs_max_sum_level: 100,
      strgy_priority_num: 100, last_checksum: '', critical_drtn_hr_cnt: 0,
      def_cost_per_hr: 0, last_recalc_date: dataDate, plan_start_date: planStart,
      plan_end_date: planFinish, scd_end_date: planFinish, add_date: planStart,
      last_tasksum_date: '', fcst_start_date: '', def_duration_type: 'DT_FixedDUR',
      task_code_prefix: 'A', guid: '{00000000-0000-0000-0000-000000000001}',
      def_qty_type: 'QT_Resource', add_by_name: 'admin'
    }]
  ));

  sections.push(table(
    'PROJWBS',
    ['wbs_id', 'proj_id', 'obs_id', 'seq_num', 'est_wt', 'proj_node_flag',
     'sum_data_flag', 'status_code', 'wbs_short_name', 'wbs_name', 'phase_id',
     'parent_wbs_id', 'ev_user_pct', 'ev_etc_user_value', 'orig_cost',
     'indep_remain_total_cost', 'ann_dscnt_rate_pct', 'dscnt_period_type',
     'indep_remain_work_qty', 'anticip_start_date', 'anticip_end_date',
     'ev_compute_type', 'ev_etc_compute_type', 'guid', 'tmpl_guid', 'plan_open_state'],
    [
      { wbs_id: 100, proj_id: 1, obs_id: 1, seq_num: 1, est_wt: 1,
        proj_node_flag: 'Y', sum_data_flag: 'N', status_code: 'WS_Open',
        wbs_short_name: 'P1', wbs_name: 'Sample Construction Project', phase_id: '',
        parent_wbs_id: '', ev_user_pct: 6, ev_etc_user_value: 0.88, orig_cost: 0,
        indep_remain_total_cost: 0, ann_dscnt_rate_pct: '', dscnt_period_type: '',
        indep_remain_work_qty: 0, anticip_start_date: '', anticip_end_date: '',
        ev_compute_type: 'EV_Schd', ev_etc_compute_type: 'EE_UserVal',
        guid: '{wbs-100}', tmpl_guid: '', plan_open_state: '' },
      { wbs_id: 110, proj_id: 1, obs_id: 1, seq_num: 1, est_wt: 1,
        proj_node_flag: 'N', sum_data_flag: 'N', status_code: 'WS_Open',
        wbs_short_name: 'DESIGN', wbs_name: 'Design Phase', phase_id: '',
        parent_wbs_id: 100, ev_user_pct: 6, ev_etc_user_value: 0.88, orig_cost: 0,
        indep_remain_total_cost: 0, ann_dscnt_rate_pct: '', dscnt_period_type: '',
        indep_remain_work_qty: 0, anticip_start_date: '', anticip_end_date: '',
        ev_compute_type: 'EV_Schd', ev_etc_compute_type: 'EE_UserVal',
        guid: '{wbs-110}', tmpl_guid: '', plan_open_state: '' },
      { wbs_id: 120, proj_id: 1, obs_id: 1, seq_num: 2, est_wt: 1,
        proj_node_flag: 'N', sum_data_flag: 'N', status_code: 'WS_Open',
        wbs_short_name: 'BUILD', wbs_name: 'Construction Phase', phase_id: '',
        parent_wbs_id: 100, ev_user_pct: 6, ev_etc_user_value: 0.88, orig_cost: 0,
        indep_remain_total_cost: 0, ann_dscnt_rate_pct: '', dscnt_period_type: '',
        indep_remain_work_qty: 0, anticip_start_date: '', anticip_end_date: '',
        ev_compute_type: 'EV_Schd', ev_etc_compute_type: 'EE_UserVal',
        guid: '{wbs-120}', tmpl_guid: '', plan_open_state: '' },
      { wbs_id: 130, proj_id: 1, obs_id: 1, seq_num: 3, est_wt: 1,
        proj_node_flag: 'N', sum_data_flag: 'N', status_code: 'WS_Open',
        wbs_short_name: 'TEST', wbs_name: 'Testing Phase', phase_id: '',
        parent_wbs_id: 100, ev_user_pct: 6, ev_etc_user_value: 0.88, orig_cost: 0,
        indep_remain_total_cost: 0, ann_dscnt_rate_pct: '', dscnt_period_type: '',
        indep_remain_work_qty: 0, anticip_start_date: '', anticip_end_date: '',
        ev_compute_type: 'EV_Schd', ev_etc_compute_type: 'EE_UserVal',
        guid: '{wbs-130}', tmpl_guid: '', plan_open_state: '' }
    ]
  ));

  sections.push(table(
    'RSRC',
    ['rsrc_id', 'parent_rsrc_id', 'clndr_id', 'role_id', 'shift_id', 'user_id',
     'pobs_id', 'guid', 'rsrc_seq_num', 'email_addr', 'employee_code',
     'office_phone', 'other_phone', 'rsrc_name', 'rsrc_short_name',
     'rsrc_title_name', 'def_qty_per_hr', 'cost_qty_type', 'ot_factor',
     'active_flag', 'auto_compute_act_flag', 'def_cost_qty_link_flag', 'ot_flag',
     'curr_id', 'unit_id', 'rsrc_type', 'location_id', 'rsrc_notes',
     'load_tasks_flag', 'level_flag', 'last_checksum'],
    [
      { rsrc_id: 10, parent_rsrc_id: '', clndr_id: 1, role_id: '', shift_id: '',
        user_id: '', pobs_id: '', guid: '{rsrc-10}', rsrc_seq_num: 1,
        email_addr: '', employee_code: 'E001', office_phone: '', other_phone: '',
        rsrc_name: 'Lead Engineer', rsrc_short_name: 'ENG', rsrc_title_name: '',
        def_qty_per_hr: 1, cost_qty_type: 'QT_Hour', ot_factor: 1.5,
        active_flag: 'Y', auto_compute_act_flag: 'N', def_cost_qty_link_flag: 'Y',
        ot_flag: 'N', curr_id: 1, unit_id: '', rsrc_type: 'RT_Labor',
        location_id: '', rsrc_notes: '', load_tasks_flag: 'Y', level_flag: 'N',
        last_checksum: '' },
      { rsrc_id: 20, parent_rsrc_id: '', clndr_id: 1, role_id: '', shift_id: '',
        user_id: '', pobs_id: '', guid: '{rsrc-20}', rsrc_seq_num: 2,
        email_addr: '', employee_code: 'E002', office_phone: '', other_phone: '',
        rsrc_name: 'Site Worker', rsrc_short_name: 'WORKER', rsrc_title_name: '',
        def_qty_per_hr: 1, cost_qty_type: 'QT_Hour', ot_factor: 1.5,
        active_flag: 'Y', auto_compute_act_flag: 'N', def_cost_qty_link_flag: 'Y',
        ot_flag: 'N', curr_id: 1, unit_id: '', rsrc_type: 'RT_Labor',
        location_id: '', rsrc_notes: '', load_tasks_flag: 'Y', level_flag: 'N',
        last_checksum: '' }
    ]
  ));

  sections.push(table(
    'TASK',
    ['task_id', 'proj_id', 'wbs_id', 'clndr_id', 'phys_complete_pct',
     'rev_fdbk_flag', 'est_wt', 'lock_plan_flag', 'auto_compute_act_flag',
     'complete_pct_type', 'task_type', 'duration_type', 'status_code',
     'task_code', 'task_name', 'rsrc_id', 'total_float_hr_cnt',
     'free_float_hr_cnt', 'remain_drtn_hr_cnt', 'act_work_qty', 'remain_work_qty',
     'target_work_qty', 'target_drtn_hr_cnt', 'target_qty_per_hr', 'act_ot_qty',
     'act_reg_qty', 'restart_date', 'reend_date', 'target_start_date',
     'target_end_date', 'rem_late_start_date', 'rem_late_end_date', 'cstr_date',
     'act_start_date', 'act_end_date', 'late_start_date', 'late_end_date',
     'expect_end_date', 'early_start_date', 'early_end_date', 'cstr_type',
     'priority_type', 'suspend_date', 'resume_date', 'float_path',
     'float_path_order', 'guid', 'tmpl_guid', 'cstr_date2', 'cstr_type2',
     'driving_path_flag', 'act_this_per_work_qty', 'act_this_per_equip_qty',
     'external_early_start_date', 'external_late_end_date', 'create_date',
     'update_date', 'create_user', 'update_user', 'location_id'],
    activities.map(a => ({
      task_id: a.taskId, proj_id: 1, wbs_id: a.wbsId, clndr_id: 1,
      phys_complete_pct: a.pctComplete ?? 0, rev_fdbk_flag: 'N', est_wt: 1,
      lock_plan_flag: 'N', auto_compute_act_flag: 'Y',
      complete_pct_type: 'CP_Drtn', task_type: a.type, duration_type: 'DT_FixedDUR',
      status_code: a.status, task_code: a.code, task_name: a.name, rsrc_id: '',
      total_float_hr_cnt: a.totalFloat ?? 0, free_float_hr_cnt: a.freeFloat ?? 0,
      remain_drtn_hr_cnt: a.remainHrs ?? a.durHrs ?? 0, act_work_qty: 0,
      remain_work_qty: 0, target_work_qty: 0,
      target_drtn_hr_cnt: a.durHrs ?? 0, target_qty_per_hr: 1, act_ot_qty: 0,
      act_reg_qty: 0, restart_date: '', reend_date: '',
      target_start_date: a.targetStart, target_end_date: a.targetEnd,
      rem_late_start_date: a.targetStart, rem_late_end_date: a.targetEnd,
      cstr_date: a.constraintDate ?? '',
      act_start_date: a.actStart ?? '', act_end_date: a.actEnd ?? '',
      late_start_date: a.targetStart, late_end_date: a.targetEnd,
      expect_end_date: '', early_start_date: a.targetStart,
      early_end_date: a.targetEnd, cstr_type: a.constraintType ?? '',
      priority_type: 'PT_Normal', suspend_date: '', resume_date: '',
      float_path: '', float_path_order: '', guid: `{task-${a.taskId}}`,
      tmpl_guid: '', cstr_date2: '', cstr_type2: '', driving_path_flag: 'N',
      act_this_per_work_qty: 0, act_this_per_equip_qty: 0,
      external_early_start_date: '', external_late_end_date: '',
      create_date: '2026-04-01 00:00', update_date: '2026-04-01 00:00',
      create_user: 'admin', update_user: 'admin', location_id: ''
    }))
  ));

  sections.push(table(
    'TASKPRED',
    ['task_pred_id', 'task_id', 'pred_task_id', 'proj_id', 'pred_proj_id',
     'pred_type', 'lag_hr_cnt', 'comments', 'float_path', 'aref', 'arls'],
    relationships.map((r, i) => ({
      task_pred_id: 5000 + i, task_id: r.succTaskId, pred_task_id: r.predTaskId,
      proj_id: 1, pred_proj_id: 1, pred_type: r.type,
      lag_hr_cnt: r.lagHrs ?? 0, comments: '', float_path: '', aref: '', arls: ''
    }))
  ));

  return [header, ...sections, '%E', ''].join(NL);
}

// ---------- Baseline -------------------------------------------------------

const BASE = {
  dataDate: '2026-04-01 00:00',
  planStart: '2026-04-01 08:00',
  planFinish: '2026-07-31 17:00',
  activities: [
    { taskId: 1000, wbsId: 110, code: 'A1000', name: 'Project Start',          type: 'TT_FinMile', status: 'TK_NotStart', durHrs: 0,  totalFloat: 0,  targetStart: '2026-04-01 08:00', targetEnd: '2026-04-01 08:00' },
    { taskId: 1010, wbsId: 110, code: 'A1010', name: 'Design Foundation',      type: 'TT_Task',    status: 'TK_NotStart', durHrs: 40, totalFloat: 16, targetStart: '2026-04-01 08:00', targetEnd: '2026-04-07 17:00' },
    { taskId: 1020, wbsId: 110, code: 'A1020', name: 'Design Walls',           type: 'TT_Task',    status: 'TK_NotStart', durHrs: 40, totalFloat: 8,  targetStart: '2026-04-08 08:00', targetEnd: '2026-04-14 17:00' },
    { taskId: 2000, wbsId: 120, code: 'A2000', name: 'Pour Foundation',        type: 'TT_Task',    status: 'TK_NotStart', durHrs: 80, totalFloat: 0,  targetStart: '2026-04-15 08:00', targetEnd: '2026-04-28 17:00' },
    { taskId: 2010, wbsId: 120, code: 'A2010', name: 'Frame Walls',            type: 'TT_Task',    status: 'TK_NotStart', durHrs: 60, totalFloat: 0,  targetStart: '2026-04-29 08:00', targetEnd: '2026-05-08 17:00' },
    { taskId: 2020, wbsId: 120, code: 'A2020', name: 'Install Roof',           type: 'TT_Task',    status: 'TK_NotStart', durHrs: 32, totalFloat: 0,  targetStart: '2026-05-11 08:00', targetEnd: '2026-05-14 17:00' },
    { taskId: 3000, wbsId: 130, code: 'A3000', name: 'Final Inspection',       type: 'TT_Task',    status: 'TK_NotStart', durHrs: 16, totalFloat: 0,  targetStart: '2026-05-15 08:00', targetEnd: '2026-05-18 17:00' },
    { taskId: 3010, wbsId: 130, code: 'A3010', name: 'Project Finish',         type: 'TT_Mile',    status: 'TK_NotStart', durHrs: 0,  totalFloat: 0,  targetStart: '2026-05-18 17:00', targetEnd: '2026-05-18 17:00' }
  ],
  relationships: [
    { predTaskId: 1000, succTaskId: 1010, type: 'PR_FS', lagHrs: 0 },
    { predTaskId: 1010, succTaskId: 1020, type: 'PR_FS', lagHrs: 0 },
    { predTaskId: 1020, succTaskId: 2000, type: 'PR_FS', lagHrs: 0 },
    { predTaskId: 2000, succTaskId: 2010, type: 'PR_FS', lagHrs: 0 },
    { predTaskId: 2010, succTaskId: 2020, type: 'PR_FS', lagHrs: 0 },
    { predTaskId: 2020, succTaskId: 3000, type: 'PR_FS', lagHrs: 0 },
    { predTaskId: 3000, succTaskId: 3010, type: 'PR_FS', lagHrs: 0 }
  ]
};

// ---------- Revised ---------------------------------------------------------

const REV = {
  dataDate: '2026-04-15 00:00',                   // shifted 14 days
  planStart: '2026-04-01 08:00',
  planFinish: '2026-07-31 17:00',
  activities: [
    BASE.activities.find(a => a.code === 'A1000'),
    // A1010: duration 40 -> 48 hr (more work scoped in)
    { ...BASE.activities.find(a => a.code === 'A1010'), durHrs: 48, totalFloat: 8 },
    BASE.activities.find(a => a.code === 'A1020'),
    // NEW: A1015 Design HVAC, in DESIGN phase
    { taskId: 1015, wbsId: 110, code: 'A1015', name: 'Design HVAC',
      type: 'TT_Task', status: 'TK_NotStart', durHrs: 24, totalFloat: 0,
      targetStart: '2026-04-15 08:00', targetEnd: '2026-04-17 17:00' },
    // A2000: renamed and shifted by 5 days
    { ...BASE.activities.find(a => a.code === 'A2000'),
      name: 'Pour Foundation (Slab)',
      targetStart: '2026-04-20 08:00', targetEnd: '2026-05-01 17:00' },
    BASE.activities.find(a => a.code === 'A2010'),
    // A2020 REMOVED
    // A3000: in progress now, 25 %
    { ...BASE.activities.find(a => a.code === 'A3000'),
      status: 'TK_Active', pctComplete: 25, actStart: '2026-05-15 08:00' },
    BASE.activities.find(a => a.code === 'A3010')
  ],
  relationships: [
    { predTaskId: 1000, succTaskId: 1010, type: 'PR_FS', lagHrs: 0 },
    // A1010 -> A1020 now has an 8 hr lag
    { predTaskId: 1010, succTaskId: 1020, type: 'PR_FS', lagHrs: 8 },
    { predTaskId: 1020, succTaskId: 2000, type: 'PR_FS', lagHrs: 0 },
    // NEW: A1015 -> A2000
    { predTaskId: 1015, succTaskId: 2000, type: 'PR_FS', lagHrs: 0 },
    { predTaskId: 2000, succTaskId: 2010, type: 'PR_FS', lagHrs: 0 },
    // REMOVED A2010 -> A2020 (with A2020 gone)
    // REMOVED A2020 -> A3000
    // NEW: A2010 -> A3000 to re-wire the chain
    { predTaskId: 2010, succTaskId: 3000, type: 'PR_FS', lagHrs: 0 },
    { predTaskId: 3000, succTaskId: 3010, type: 'PR_FS', lagHrs: 0 }
  ]
};

writeFileSync(join(here, 'sample-baseline.xer'), buildXer(BASE));
writeFileSync(join(here, 'sample-revised.xer'),  buildXer(REV));
console.log('wrote sample-baseline.xer and sample-revised.xer');
