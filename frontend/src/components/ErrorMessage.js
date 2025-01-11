// src/components/ErrorMessage.js
import React from "react";

const ErrorMessage = ({ error }) => {
  return <p style={{ color: "red" }}>Error: {error}</p>;
};

export default ErrorMessage;
