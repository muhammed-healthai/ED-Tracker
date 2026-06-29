const triageOptions = ["Red", "Amber", "Green"];

function AddPatientModal({ newPatient, setNewPatient, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <h2>Add patient</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="add-form">
          <label>
            Name *
            <input
              type="text"
              value={newPatient.name}
              onChange={(e) =>
                setNewPatient((n) => ({ ...n, name: e.target.value }))
              }
              placeholder="Surname, First name"
            />
          </label>
          <label>
            Patient ID
            <input
              type="text"
              value={newPatient.patientId}
              onChange={(e) =>
                setNewPatient((n) => ({ ...n, patientId: e.target.value }))
              }
              placeholder="e.g. H123456"
            />
          </label>
          <label>
            Date of birth
            <input
              type="date"
              value={newPatient.dob}
              onChange={(e) =>
                setNewPatient((n) => ({ ...n, dob: e.target.value }))
              }
            />
          </label>
          <label className="full-row">
            Presenting complaint *
            <input
              type="text"
              value={newPatient.presentingComplaint}
              onChange={(e) =>
                setNewPatient((n) => ({
                  ...n,
                  presentingComplaint: e.target.value,
                }))
              }
              placeholder="e.g. Central chest pain"
            />
          </label>
          <label>
            Triage
            <select
              value={newPatient.triage}
              onChange={(e) =>
                setNewPatient((n) => ({ ...n, triage: e.target.value }))
              }
            >
              {triageOptions.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </label>
          <label>
            Phone
            <input
              type="text"
              value={newPatient.phone}
              onChange={(e) =>
                setNewPatient((n) => ({ ...n, phone: e.target.value }))
              }
              placeholder="07…"
            />
          </label>
          <label className="full-row">
            Address
            <input
              type="text"
              value={newPatient.address}
              onChange={(e) =>
                setNewPatient((n) => ({ ...n, address: e.target.value }))
              }
            />
          </label>
          <label>
            Emergency contact
            <input
              type="text"
              value={newPatient.emergencyContact}
              onChange={(e) =>
                setNewPatient((n) => ({
                  ...n,
                  emergencyContact: e.target.value,
                }))
              }
            />
          </label>
          <label>
            GP name
            <input
              type="text"
              value={newPatient.gpName}
              onChange={(e) =>
                setNewPatient((n) => ({ ...n, gpName: e.target.value }))
              }
            />
          </label>
          <label>
            GP practice
            <input
              type="text"
              value={newPatient.gpPractice}
              onChange={(e) =>
                setNewPatient((n) => ({ ...n, gpPractice: e.target.value }))
              }
            />
          </label>
          <label>
            GP phone
            <input
              type="text"
              value={newPatient.gpPhone}
              onChange={(e) =>
                setNewPatient((n) => ({ ...n, gpPhone: e.target.value }))
              }
            />
          </label>
        </div>
        <button
          className="primary-btn full-width"
          style={{ marginTop: "16px" }}
          onClick={onSubmit}
        >
          Add patient
        </button>
      </div>
    </div>
  );
}

export default AddPatientModal;