import React from "react";

function YearInput({ year, setYear }) {
  const handleChange = (e) => {
    const value = e.target.value;

    // allow only up to 4 digits
    if (/^\d{0,4}$/.test(value)) {
      setYear(value);
    }
  };

  return (
    <div>
      <h2>Enter Year</h2>
      <input
        type="text"
        value={year}
        onChange={handleChange}
        placeholder="YYYY"
      />
    </div>
  );
}

export default YearInput;
