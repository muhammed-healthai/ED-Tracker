// wardDb.js — the bridge from ED Tracker into the shared ward database.
//
// This is the ONLY file that talks to the Patient Data Centre's Supabase
// project. ED Tracker keeps its own fast localStorage board exactly as it
// was; this file adds one thing — sendPatientToWard() — which publishes a
// patient + their full ED record into the shared tables at the moment of
// transfer (the real-world ADT A02 "admit to ward" event).
//
// The key below is the PUBLISHABLE key. It is safe to ship in front-end
// code — it can only do what your table policies allow. Never put the
// secret (sb_secret_...) key in a file like this.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zmbhzevdqcybqebtfhgf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8_crUzoMYpkxiFk-gF0ArQ_QyQe7v-l";

export const wardDb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ---- small date/time helpers -------------------------------------------
// The ward schema stores `date` as YYYY-MM-DD and `time` as HH:MM (both text).

function isoToDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function isoToTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return isoToTime(new Date().toISOString());
}

// Panel key (ED Tracker) -> panel label (ward Results tab)
const PANEL_LABELS = {
  fbc: "FBC",
  ues: "U&E",
  lfts: "LFTs",
  inflammatory: "CRP",
  otherMarkers: "Other markers",
  bloodGas: "Blood gas",
};

/**
 * Publish one ED Tracker patient into the shared ward database.
 *
 * Idempotent: re-sending the same patient upserts onto stable IDs, so you
 * can test repeatedly without creating duplicate rows. Returns the ward
 * patient id (e.g. "pt_ed_H123456").
 *
 * @param {object} patient  an ED Tracker patient object
 * @param {string} ward     destination ward/bed label
 */
export async function sendPatientToWard(patient, ward = "Ward 6 / Bed 9") {
  if (!patient) throw new Error("No patient supplied");

  // Stable ward id keyed on the hospital number so re-sends update in place.
  const pid = `pt_ed_${patient.patientId || patient.id}`;
  const scale = patient.news2Scale === "scale2" ? 2 : 1;

  // ---- 1. patient row --------------------------------------------------
  const patientRow = {
    id: pid,
    nhs_number: null, // ED Tracker doesn't capture NHS number
    hospital_id: patient.patientId || null,
    name: patient.name || null,
    dob: null,
    ward: ward,
    consultant: null,
    location: ward, // now on the ward
    admitted_date: todayDate(),
    discharged: false,
    discharged_date: null,
  };

  // ---- 2. entries (notes, NEWS, imaging text, the transfer event) ------
  const entries = [];

  (patient.notes || []).forEach((n) => {
    entries.push({
      id: `ent_ednote_${pid}_${n.id}`,
      patient_id: pid,
      type: "note",
      location: "ED",
      source: "ED Tracker",
      date: isoToDate(n.createdAt),
      time: n.time || isoToTime(n.createdAt),
      payload: {
        noteCategory: "General note",
        noteText: n.text || "",
        signName: n.authorName || "",
        signGrade: n.authorRole || "",
      },
    });
  });

  (patient.newsHistory || []).forEach((h, i) => {
    const onOxygen = !!(h.o2 && h.o2 !== "Air");
    entries.push({
      id: `ent_ednews_${pid}_${i}`,
      patient_id: pid,
      type: "news",
      location: "ED",
      source: "ED Tracker",
      date: isoToDate(h.createdAt) || isoToDate(patient.arrivalAt),
      time: h.time || isoToTime(h.createdAt),
      payload: {
        news: {
          rr: h.rr || "",
          spo2: h.spo2 || "",
          scale: scale,
          o2: onOxygen,
          o2device: onOxygen ? h.o2 : "",
          sbp: h.sbp || "",
          dbp: "",
          pulse: h.hr || "",
          consciousness: h.avpu || "A",
          temp: h.temp || "",
        },
        signName: h.authorName || "",
        signGrade: h.authorRole || "",
      },
    });
  });

  if (patient.imagingText && patient.imagingText.trim()) {
    entries.push({
      id: `ent_edimg_${pid}`,
      patient_id: pid,
      type: "note",
      location: "ED",
      source: "ED Tracker",
      date: isoToDate(patient.arrivalAt),
      time: "",
      payload: {
        noteCategory: "Imaging",
        noteText: `Imaging requested/performed in ED: ${patient.imagingText}`,
        signName: "",
        signGrade: "",
      },
    });
  }

  // The transfer event itself — this is what makes the ward Journey tab
  // show an ED -> ward handover with a "time in ED" metric.
  entries.push({
    id: `ent_edtransfer_${pid}`,
    patient_id: pid,
    type: "transfer",
    location: "ED",
    source: "ED Tracker",
    date: todayDate(),
    time: nowTime(),
    payload: {
      from: "ED",
      to: ward,
      signName: "ED Coordinator",
      signGrade: "Charge Nurse",
    },
  });

  // ---- 3. labs (one row per populated blood panel) ---------------------
  const labs = [];
  (patient.bloodResults || []).forEach((b, bi) => {
    Object.entries(b.panels || {}).forEach(([panelKey, fields]) => {
      const results = Object.entries(fields || {})
        .filter(
          ([k, v]) => k !== "type" && v != null && String(v).trim() !== ""
        )
        .map(([k, v]) => ({
          name: k.toUpperCase(),
          value: String(v),
          unit: "",
          low: null,
          high: null,
        }));
      if (results.length === 0) return;
      labs.push({
        id: `lab_ed_${pid}_${bi}_${panelKey}`,
        patient_id: pid,
        panel: PANEL_LABELS[panelKey] || panelKey,
        date: isoToDate(b.sampleTakenAt),
        time: isoToTime(b.sampleTakenAt),
        source: "ED",
        results: results,
      });
    });
  });

  // ---- 4. write everything (upsert = safe to re-run) -------------------
  const pRes = await wardDb.from("patients").upsert(patientRow);
  if (pRes.error) throw pRes.error;

  if (entries.length) {
    const eRes = await wardDb.from("entries").upsert(entries);
    if (eRes.error) throw eRes.error;
  }

  if (labs.length) {
    const lRes = await wardDb.from("labs").upsert(labs);
    if (lRes.error) throw lRes.error;
  }

  return pid;
}