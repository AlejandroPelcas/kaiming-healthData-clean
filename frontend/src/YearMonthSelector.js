function YearMonthSelector({ year, month, setYear, setMonth }) {
  return (
      <div>
          <h3>Select Month</h3>

          <button
              className={month === "01" ? "selected" : ""}
              onClick={() => setMonth("01")}
          >
              January
          </button>

          <button
              className={month === "02" ? "selected" : ""}
              onClick={() => setMonth("02")}
          >
              February
          </button>

          <button
              className={month === "03" ? "selected" : ""}
              onClick={() => setMonth("03")}
          >
              March
          </button>

          <button
              className={month === "04" ? "selected" : ""}
              onClick={() => setMonth("04")}
          >
              April
          </button>

          <button
              className={month === "05" ? "selected" : ""}
              onClick={() => setMonth("05")}
          >
              May
          </button>

          <button
              className={month === "06" ? "selected" : ""}
              onClick={() => setMonth("06")}
          >
              June
          </button>

          <button
              className={month === "07" ? "selected" : ""}
              onClick={() => setMonth("07")}
          >
              July
          </button>

          <button
              className={month === "08" ? "selected" : ""}
              onClick={() => setMonth("08")}
          >
              August
          </button>

          <button
              className={month === "09" ? "selected" : ""}
              onClick={() => setMonth("09")}
          >
              September
          </button>

          <button
              className={month === "10" ? "selected" : ""}
              onClick={() => setMonth("10")}
          >
              October
          </button>

          <button
              className={month === "11" ? "selected" : ""}
              onClick={() => setMonth("11")}
          >
              November
          </button>

          <button
              className={month === "12" ? "selected" : ""}
              onClick={() => setMonth("12")}
          >
              December
          </button>

          <p>Year: {year}</p>
          <p>Month: {month}</p>
      </div>
  );
}

export default YearMonthSelector;