import { useState } from "react";

function YearMonthSelector({year, month, setYear, setMonth}) {
    return (
        <div>
            <h3>Select Year</h3>
            <button onClick={() => setYear("2024")}> 2024 </button>
            <button onClick={() => setYear("2025")}> 2025 </button>
            <button onClick={() => setYear("2026")}> 2026 </button>
            <button onClick={() => setYear("2027")}> 2027 </button>


            <h3>Select Month</h3>
            <button onClick={() => setMonth("01")}>January</button>
            <button onClick={() => setMonth("02")}>February</button>
            <button onClick={() => setMonth("03")}>March</button>
            <button onClick={() => setMonth("04")}>April</button>
            <button onClick={() => setMonth("05")}>May</button>
            <button onClick={() => setMonth("06")}>June</button>
            <button onClick={() => setMonth("07")}>July</button>
            <button onClick={() => setMonth("08")}>August</button>
            <button onClick={() => setMonth("09")}>September</button>
            <button onClick={() => setMonth("10")}>October</button>
            <button onClick={() => setMonth("11")}>November</button>
            <button onClick={() => setMonth("12")}>December</button>

            <p>Year: {year}</p>
            <p>Month: {month}</p>
    </div>
  );
}

export default YearMonthSelector;



// function YearMonthSelector() {
//   const [year, setYear] = useState(null);
//   const [month, setMonth] = useState(null);

//   const sendToFlask = async (newYear, newMonth) => {
//     await fetch("http://localhost:5000/receive-date", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         year: newYear,
//         month: newMonth,
//       }),
//     });
//   };

//   const handleYearClick = (selectedYear) => {
//     setYear(selectedYear);
//     sendToFlask(selectedYear, month);
//   };

//   const handleMonthClick = (selectedMonth) => {
//     setMonth(selectedMonth);
//     sendToFlask(year, selectedMonth);
//   };

//   return (
//     <div>
//       <h2>Select Year</h2>
//       <button onClick={() => handleYearClick(2024)}>2024</button>
//       <button onClick={() => handleYearClick(2025)}>2025</button>

//       <h2>Select Month</h2>
//       <button onClick={() => handleMonthClick("January")}>January</button>
//       <button onClick={() => handleMonthClick("February")}>February</button>

//       <p>Year: {year}</p>
//       <p>Month: {month}</p>
//     </div>
//   );
// }

// export default YearMonthSelector;
