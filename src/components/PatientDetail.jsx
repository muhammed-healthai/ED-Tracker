import { useState } from "react";
import NewsChart from "./NewsChart";
import NotesHistory from "./NotesHistory";
import BloodsHistory from "./BloodsHistory";

const referralOptions = [
  "Medics",
  "Surgeons",
  "Paeds",
  "Gynae",
  "Ortho",
  "ENT",
  "ICU",
  "Anaesthetics",
  "Psych",
];

function PatientDetail({
    patient,
    note,
    setNote,
    newNews,
    setNewNews,
    parseInProgress,
    dischargeInProgress,
    onClose,
    onSubmitNote,
    onToggleTask,
    onUpdateImagingText,
    onUpdateReferralChoice,
    onSetNews2Scale,
    onAddNewsEntry,
    onDischarge,
    onParseClerking,
    onOpenBloodsModal,
    onSendToWard,
    sendingToWard,
  }) {

  const [showNewsChart, setShowNewsChart] = useState(false);

  return (
    <div className="detail-card">
      <div className="detail-header">
        <h2>{patient.name}</h2>
        <button onClick={onClose}>Close</button>
      </div>

      <div className="contact-banner">
        <div>
          <strong>Patient ID:</strong> {patient.patientId}
        </div>
        <div>
          <strong>Address:</strong> {patient.address || "—"}
        </div>
        <div>
          <strong>Phone:</strong> {patient.phone || "—"}
        </div>
        <div>
          <strong>Emergency Contact:</strong>{" "}
          {patient.emergencyContact || "—"}
        </div>
        <div>
          <strong>GP:</strong>{" "}
          {patient.gpName
            ? `${patient.gpName} (${patient.gpPractice}) – ${patient.gpPhone}`
            : "—"}
        </div>
      </div>

      <label className="block-label">
        Free text to document
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Clerking, plan, handover notes… (paste a narrative and click Autofill to extract observations)"
        />
      </label>

      <div className="note-actions">
        <button
          className="primary-btn"
          onClick={onSubmitNote}
        >
          Submit Note
        </button>
        <button
          type="button"
          className="ghost-btn-dark parse-btn"
          onClick={onParseClerking}
          disabled={parseInProgress || !note.trim()}
          title="Use Claude to fill in obs and presenting complaint from the note above"
        >
          {parseInProgress ? "Filling in…" : "✨ Auto-fill with AI"}
        </button>
      </div>

      <div className="tasks">
        <label>
          <input
            type="checkbox"
            checked={!!patient.tasks?.triage}
            disabled={!!patient.tasks?.triage}
            onChange={() => onToggleTask("triage")}
          />
          Triage
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!patient.tasks?.bloods}
            disabled={!!patient.tasks?.bloods}
            onChange={() => onToggleTask("bloods")}
          />
          Bloods
        </label>
        <button
          type="button"
          className="ghost-btn-dark bloods-add-btn"
          onClick={onOpenBloodsModal}
          title="Record structured blood results (signed entry)"
        >
          + Add bloods result
        </button>
        <label>
          <input
            type="checkbox"
            checked={!!patient.tasks?.imaging}
            disabled={!!patient.tasks?.imaging}
            onChange={() => onToggleTask("imaging")}
          />
          Imaging
        </label>
        <input
          type="text"
          className="imaging-input"
          value={patient.imagingText || ""}
          onChange={(e) => onUpdateImagingText(e.target.value)}
          placeholder="state imaging (e.g. CXR, CT head)"
        />
        <label>
          <input
            type="checkbox"
            checked={!!patient.tasks?.referral}
            disabled={!!patient.tasks?.referral}
            onChange={() => onToggleTask("referral")}
          />
          Referral
        </label>
        <select
          value={patient.referralChoice || referralOptions[0]}
          onChange={(e) => onUpdateReferralChoice(e.target.value)}
        >
          {referralOptions.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <NotesHistory notes={patient.notes} />
      <BloodsHistory bloodResults={patient.bloodResults} />

      <div className="news-section">
        <strong>NEWS:</strong> {patient.newsScore}
        <button
          className="link-btn"
          onClick={() => setShowNewsChart((prev) => !prev)}
        >
          {showNewsChart ? "Hide chart" : "View chart"}
        </button>
      </div>

      {showNewsChart && (
        <NewsChart
          patient={patient}
          newNews={newNews}
          setNewNews={setNewNews}
          onAddNewsEntry={onAddNewsEntry}
          onSetScale={onSetNews2Scale}
        />
      )}

      <button
        className="primary-btn full-width"
        onClick={onSendToWard}
        disabled={sendingToWard}
        title="Publish this patient and their full ED record to the shared Patient Data Centre"
      >
        {sendingToWard
          ? "Sending to ward…"
          : "🏥 Admit to ward (send to Patient Data Centre)"}
      </button>

<button
        className="primary-btn full-width"
        onClick={onDischarge}
        disabled={dischargeInProgress}
      >
        {dischargeInProgress
          ? "Generating discharge summary…"
          : "✨ Discharge with AI summary"}
      </button>
    </div>
  );
}

export default PatientDetail;