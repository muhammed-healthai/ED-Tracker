import { useState, useEffect } from "react";
import "./App.css";
import TopBar from "./components/TopBar";
import StatsBanner from "./components/StatsBanner";
import PatientTable from "./components/PatientTable";
import PatientDetail from "./components/PatientDetail";
import AddPatientModal from "./components/AddPatientModal";
import ParsePreviewModal from "./components/ParsePreviewModal";
import DischargeSummaryModal from "./components/DischargeSummaryModal";
import LoginPage from "./components/LoginPage";
import PasswordConfirmModal from "./components/PasswordConfirmModal";
import BloodsModal from "./components/BloodsModal";
import { extractClerking, generateDischargeSummary } from "./lib/llm";
import { loadSession, saveSession, clearSession } from "./lib/auth";
import { sendPatientToWard } from "./lib/wardDb";

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

const emptyTasks = {
  triage: false,
  bloods: false,
  imaging: false,
  referral: false,
};

function buildInitialPatients() {
  const now = Date.now();
  // Demo patients pretend to have arrived 3h57m and 2h10m ago
  const johnArrival = new Date(now - (3 * 60 + 57) * 60 * 1000).toISOString();
  const sarahArrival = new Date(now - (2 * 60 + 10) * 60 * 1000).toISOString();

  return [
    {
      id: 1,
      patientId: "H123456",
      name: "John Smith",
      dob: "1958-04-12",
      address: "24 Green Street, London E1 6AA",
      gpName: "Dr Patel",
      gpPractice: "Whitechapel Health Centre",
      gpPhone: "0207 123 4567",

      arrivalAt: johnArrival,
      clinicianSeenAt: null,
      dischargedAt: null,

      triage: "Red",
      referral: "Medics",
      phone: "07123 456789",
      emergencyContact: "Jane Smith",
      presentingComplaint: "Central chest pain",
      status: "Waiting medical review",

      newsScore: 4,
      newsHistory: [
        {
          time: "13:40",
          rr: "22",
          spo2: "95",
          o2: "Air",
          temp: "37.5",
          sbp: "110",
          hr: "104",
          avpu: "A",
          score: "4",
        },
      ],

      notes: [],
      tasks: { ...emptyTasks },
      imagingText: "",
      referralChoice: "Medics",
      news2Scale: "scale1",
      bloodResults: [],
    },
    {
      id: 2,
      patientId: "H987654",
      name: "Sarah Ahmed",
      dob: "1992-11-30",
      address: "12 Oak Avenue, London N1 4QR",
      gpName: "Dr Williams",
      gpPractice: "North Road Medical Centre",
      gpPhone: "0208 222 1133",

      arrivalAt: sarahArrival,
      clinicianSeenAt: null,
      dischargedAt: null,

      triage: "Amber",
      referral: "Surgeons",
      phone: "07111 222333",
      emergencyContact: "Mother",
      presentingComplaint: "RIF pain",
      status: "Waiting surgical review",

      newsScore: 2,
      newsHistory: [
        {
          time: "13:50",
          rr: "18",
          spo2: "98",
          o2: "Air",
          temp: "36.9",
          sbp: "120",
          hr: "88",
          avpu: "A",
          score: "2",
        },
      ],

      notes: [],
      tasks: { ...emptyTasks },
      imagingText: "",
      referralChoice: "Surgeons",
      news2Scale: "scale1",
      bloodResults: [],
    },
  ];
}

const initialPatients = buildInitialPatients();

const STORAGE_KEY = "ed-tracker-patients-v1";

function loadPatientsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch (err) {
    console.warn("Failed to load patients from localStorage", err);
    return null;
  }
}

const emptyNewNews = {
  time: "",
  rr: "",
  spo2: "",
  o2: "",
  temp: "",
  sbp: "",
  hr: "",
  avpu: "",
  score: "",
};

const emptyNewPatient = {
  name: "",
  patientId: "",
  dob: "",
  presentingComplaint: "",
  triage: "Amber",
  phone: "",
  emergencyContact: "",
  address: "",
  gpName: "",
  gpPractice: "",
  gpPhone: "",
};

function App() {
  const [currentUser, setCurrentUser] = useState(() => loadSession());
  const [patients, setPatients] = useState(
    () => loadPatientsFromStorage() || initialPatients
  );
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  const [note, setNote] = useState("");
  const [newNews, setNewNews] = useState(emptyNewNews);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newPatient, setNewPatient] = useState(emptyNewPatient);
  const [parseInProgress, setParseInProgress] = useState(false);
  const [parsePreview, setParsePreview] = useState(null); // {parsed, source, error} when modal should show
  // Pending action awaiting password re-verify.
  // { kind: 'note' | 'news', payload: any } or null.
  const [pendingSignedAction, setPendingSignedAction] = useState(null);
  const [showBloodsModal, setShowBloodsModal] = useState(false);
  const [sendingToWard, setSendingToWard] = useState(false);
  const [dischargeInProgress, setDischargeInProgress] = useState(false);
  const [dischargePreview, setDischargePreview] = useState(null);
  const [dischargingPatientId, setDischargingPatientId] = useState(null);

  // Live tick for timer displays. Updates every 30 seconds — fast
  // enough that "Time in dept" feels live, slow enough to not thrash
  // React's render cycle. Components compute their own h:mm strings
  // off this tick.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  // Persist patients whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    } catch (err) {
      console.warn("Failed to save patients to localStorage", err);
    }
  }, [patients]);

  const selectedPatient =
    patients.find((p) => p.id === selectedPatientId) || null;

  // Generic helper: apply a partial update to a single patient by id
  const updatePatient = (id, updater) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updater(p) } : p))
    );
  };

  const handleRowClick = (id) => {
    setSelectedPatientId(id);
    setNote("");
    setNewNews(emptyNewNews);
  };

  const handleClosePatient = () => {
    setSelectedPatientId(null);
  };

  const toggleTask = (name) => {
    if (!selectedPatientId) return;
    updatePatient(selectedPatientId, (p) => {
      if (p.tasks?.[name]) return {};
      return { tasks: { ...(p.tasks || emptyTasks), [name]: true } };
    });
  };

  const updateImagingText = (value) => {
    if (!selectedPatientId) return;
    updatePatient(selectedPatientId, () => ({ imagingText: value }));
  };

  const updateReferralChoice = (value) => {
    if (!selectedPatientId) return;
    updatePatient(selectedPatientId, () => ({ referralChoice: value }));
  };

  const setNews2Scale = (scale) => {
    if (!selectedPatientId) return;
    updatePatient(selectedPatientId, () => ({ news2Scale: scale }));
  };
  const handleLogin = (user) => {
    setCurrentUser(user);
    saveSession(user);
  };

  const handleLogout = () => {
    if (
      !confirm(
        "Sign out? Patient data on this device will be preserved for the next user."
      )
    )
      return;
    setCurrentUser(null);
    setSelectedPatientId(null);
    clearSession();
  };
  
  const handleResetDemo = () => {
    if (
      !confirm(
        "Reset to demo data? This will discard all patients you've added."
      )
    )
      return;
    setPatients(buildInitialPatients());
    setSelectedPatientId(null);
  };

  // ADMIT TO WARD — publish this patient + their full ED record into the
  // shared Patient Data Centre database. Non-destructive: the patient stays
  // on the ED board so you can re-test (re-sending upserts, no duplicates).
  const handleSendToWard = async () => {
    if (!selectedPatient) return;
    if (
      !confirm(
        `Admit ${selectedPatient.name} to the ward?\n\nThis publishes the patient and their full ED record (notes, NEWS, bloods) into the shared Patient Data Centre.`
      )
    )
      return;
    setSendingToWard(true);
    try {
      await sendPatientToWard(selectedPatient);
      alert(
        `${selectedPatient.name} has been admitted to the ward and is now visible in the Patient Data Centre.`
      );
    } catch (err) {
      console.error("Send to ward failed", err);
      alert(
        "Could not send to ward: " +
          (err?.message || String(err)) +
          "\n\nCheck the browser console for details."
      );
    } finally {
      setSendingToWard(false);
    }
  };

  const handleDischarge = async () => {
    if (!selectedPatientId || !selectedPatient) return;
    setDischargeInProgress(true);
    setDischargingPatientId(selectedPatientId);
    try {
      const result = await generateDischargeSummary(selectedPatient);
      setDischargePreview(result);
    } finally {
      setDischargeInProgress(false);
    }
  };

  const handleConfirmDischarge = () => {
    const idToRemove = dischargingPatientId;
    if (!idToRemove) {
      setDischargePreview(null);
      return;
    }
    // Stamp dischargedAt before removal — preserves the timestamp if we
    // ever add an "audit log of discharged patients" view
    updatePatient(idToRemove, () => ({
      dischargedAt: new Date().toISOString(),
    }));
    // Use a microtask to let the state update settle before removing
    setTimeout(() => {
      setPatients((prev) => prev.filter((p) => p.id !== idToRemove));
      if (selectedPatientId === idToRemove) {
        setSelectedPatientId(null);
      }
      setDischargingPatientId(null);
      setDischargePreview(null);
    }, 0);
  };

  const handleCancelDischarge = () => {
    setDischargePreview(null);
    setDischargingPatientId(null);
  };

  // Step 1: clinician clicks Submit Note → we show the password modal.
  // The actual write happens after password verification.
  const handleSubmitNote = () => {
    if (!note.trim() || !selectedPatientId || !currentUser) return;
    setPendingSignedAction({
      kind: "note",
      payload: { text: note.trim(), patientId: selectedPatientId },
    });
  };

  // Step 2: password verified → actually save the note.
  const commitNote = (payload) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const newNote = {
      id: `note-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      time: timestamp,
      text: payload.text,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      authorUsername: currentUser.username,
      createdAt: now.toISOString(),
    };
    updatePatient(payload.patientId, (p) => {
      const update = { notes: [...(p.notes || []), newNote] };
      // Stamp clinicianSeenAt the first time a Doctor submits a note
      if (!p.clinicianSeenAt && currentUser.role === "Doctor") {
        update.clinicianSeenAt = now.toISOString();
      }
      return update;
    });
    setNote("");
  };

  // Step 1: clinician clicks Save NEWS entry → we show the password modal.
  const handleAddNewsEntry = (liveNews) => {
    if (!selectedPatientId || !currentUser) return;
    if (!liveNews || liveNews.total === null) {
      alert("Please enter at least one observation before saving.");
      return;
    }

    const timestamp =
      newNews.time ||
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    setPendingSignedAction({
      kind: "news",
      payload: {
        patientId: selectedPatientId,
        entry: {
          time: timestamp,
          rr: newNews.rr,
          spo2: newNews.spo2,
          o2: newNews.o2,
          temp: newNews.temp,
          sbp: newNews.sbp,
          hr: newNews.hr,
          avpu: newNews.avpu,
          score: String(liveNews.total),
        },
        total: liveNews.total,
      },
    });
  };
// BLOODS — same two-step pattern as note + NEWS

const handleSubmitBloods = (data) => {
  if (!selectedPatientId || !currentUser) return;
  setShowBloodsModal(false);
  setPendingSignedAction({
    kind: "bloods",
    payload: { patientId: selectedPatientId, ...data },
  });
};

const commitBloodsEntry = (payload) => {
  const now = new Date();
  const entry = {
    id: `blood-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    sampleTakenAt: payload.sampleTakenAt,
    resultsAvailableAt: payload.resultsAvailableAt,
    panels: payload.panels,
    authorName: currentUser.name,
    authorRole: currentUser.role,
    authorUsername: currentUser.username,
    createdAt: now.toISOString(),
  };
  updatePatient(payload.patientId, (p) => ({
    bloodResults: [...(p.bloodResults || []), entry],
    // Auto-tick the bloods task once results are entered
    tasks: { ...(p.tasks || {}), bloods: true },
  }));
};

  // Step 2: password verified → actually save the NEWS entry.
  const commitNewsEntry = (payload) => {
    const now = new Date();
    const entryWithMeta = {
      ...payload.entry,
      id: `news-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      authorUsername: currentUser.username,
      createdAt: now.toISOString(),
    };
    updatePatient(payload.patientId, (p) => ({
      newsHistory: [...(p.newsHistory || []), entryWithMeta],
      newsScore: payload.total,
    }));
    setNewNews(emptyNewNews);
  };

  // Dispatcher called by PasswordConfirmModal once password verified.
  const handleSignedActionConfirmed = () => {
    if (!pendingSignedAction) return;
    if (pendingSignedAction.kind === "note") {
      commitNote(pendingSignedAction.payload);
    } else if (pendingSignedAction.kind === "news") {
      commitNewsEntry(pendingSignedAction.payload);
    } else if (pendingSignedAction.kind === "bloods") {
      commitBloodsEntry(pendingSignedAction.payload);
    }
    setPendingSignedAction(null);
  };

  const handleParseClerking = async () => {
    if (!note.trim() || !selectedPatientId) return;
    setParseInProgress(true);
    try {
      const result = await extractClerking(note);
      setParsePreview(result);
    } finally {
      setParseInProgress(false);
    }
  };

  const handleApplyParse = (data) => {
    if (!selectedPatientId) {
      setParsePreview(null);
      return;
    }
    updatePatient(selectedPatientId, (p) => {
      const update = {};
      if (data.presentingComplaint) {
        update.presentingComplaint = data.presentingComplaint;
      }
      if (data.triage) {
        update.triage = data.triage;
      }
      // Pre-fill the NEWS observation form (does not save automatically;
      // user reviews + clicks Save NEWS entry to commit)
      return update;
    });

    // Pre-fill the NEWS form with the extracted obs so the user only
    // has to click Save NEWS entry to commit them.
    if (data.observations) {
      setNewNews((n) => ({
        ...n,
        rr: data.observations.rr || "",
        spo2: data.observations.spo2 || "",
        o2: data.observations.o2 || "",
        temp: data.observations.temp || "",
        sbp: data.observations.sbp || "",
        hr: data.observations.hr || "",
        avpu: data.observations.avpu || "",
      }));
    }

    setParsePreview(null);
  };
  const handleAddPatient = () => {
    if (!newPatient.name.trim() || !newPatient.presentingComplaint.trim()) {
      alert("Name and presenting complaint are required.");
      return;
    }

    const nextId =
      patients.length === 0 ? 1 : Math.max(...patients.map((p) => p.id)) + 1;

      const created = {
        id: nextId,
        patientId: newPatient.patientId.trim() || `H${100000 + nextId}`,
        name: newPatient.name.trim(),
        dob: newPatient.dob || "",
        address: newPatient.address.trim(),
        gpName: newPatient.gpName.trim(),
        gpPractice: newPatient.gpPractice.trim(),
        gpPhone: newPatient.gpPhone.trim(),
  
        arrivalAt: new Date().toISOString(),
        clinicianSeenAt: null,
        dischargedAt: null,
  
        triage: newPatient.triage,
        referral: "—",
        phone: newPatient.phone.trim(),
        emergencyContact: newPatient.emergencyContact.trim(),
        presentingComplaint: newPatient.presentingComplaint.trim(),
        status: "Awaiting clinician",
  
        newsScore: 0,
        newsHistory: [],
  
        notes: [],
        tasks: { ...emptyTasks },
        imagingText: "",
        referralChoice: referralOptions[0],
        news2Scale: "scale1",
        bloodResults: [],
      };

    setPatients((prev) => [...prev, created]);
    setShowAddForm(false);
    setNewPatient(emptyNewPatient);
  };

  // Gate the entire app behind login
  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <TopBar
        currentUser={currentUser}
        onAddPatient={() => setShowAddForm(true)}
        onResetDemo={handleResetDemo}
        onLogout={handleLogout}
      />

      <div className="content">
      <StatsBanner patients={patients} nowTick={nowTick} />
        <PatientTable
          patients={patients}
          nowTick={nowTick}
          onRowClick={handleRowClick}
        />

        {selectedPatient && (
          <PatientDetail
            patient={selectedPatient}
            note={note}
            setNote={setNote}
            newNews={newNews}
            setNewNews={setNewNews}
            parseInProgress={parseInProgress}
            dischargeInProgress={dischargeInProgress}
            onClose={handleClosePatient}
            onSubmitNote={handleSubmitNote}
            onToggleTask={toggleTask}
            onUpdateImagingText={updateImagingText}
            onUpdateReferralChoice={updateReferralChoice}
            onSetNews2Scale={setNews2Scale}
            onAddNewsEntry={handleAddNewsEntry}
            onDischarge={handleDischarge}
            onParseClerking={handleParseClerking}
            onOpenBloodsModal={() => setShowBloodsModal(true)}
            onSendToWard={handleSendToWard}
            sendingToWard={sendingToWard}
          />
        )}
      </div>

      {showAddForm && (
        <AddPatientModal
          newPatient={newPatient}
          setNewPatient={setNewPatient}
          onClose={() => setShowAddForm(false)}
          onSubmit={handleAddPatient}
        />
      )}

{parsePreview && (
        <ParsePreviewModal
          initialData={parsePreview.parsed}
          source={parsePreview.source}
          error={parsePreview.error}
          onCancel={() => setParsePreview(null)}
          onApply={handleApplyParse}
        />
      )}

{dischargePreview && dischargingPatientId !== null && (
        <DischargeSummaryModal
          patient={
            patients.find((p) => p.id === dischargingPatientId) ||
            selectedPatient
          }
          initialSummary={dischargePreview.summary}
          source={dischargePreview.source}
          error={dischargePreview.error}
          onCancel={handleCancelDischarge}
          onConfirmDischarge={handleConfirmDischarge}
        />
      )}

{pendingSignedAction && currentUser && (
        <PasswordConfirmModal
          user={currentUser}
          action={
            pendingSignedAction.kind === "note"
              ? "sign this clinical note"
              : pendingSignedAction.kind === "news"
              ? "sign this NEWS entry"
              : "sign these blood results"
          }
          onCancel={() => setPendingSignedAction(null)}
          onConfirmed={handleSignedActionConfirmed}
        />
      )}

      {showBloodsModal && currentUser && (
        <BloodsModal
          onCancel={() => setShowBloodsModal(false)}
          onSubmit={handleSubmitBloods}
        />
      )}
    </div>
  );
}

export default App;