import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./components/Layout/MainLayout";
import TransportDocuments from "./pages/TransportDocuments";

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route
          path="/"
          element={<Navigate to="/transport-documents" replace />}
        />
        <Route path="/transport-documents" element={<TransportDocuments />} />
      </Routes>
    </MainLayout>
  );
}

export default App;
