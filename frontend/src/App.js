// #@Author: Alejandro Pelcastre
import React, { useState } from "react"; // this line not used but needed
import FileDrop from "./DragAndDrop";
import YearMonthSelector from "./YearMonthSelector";
import HealthProviderButton from "./HealthProvider";
import MisMatchTable from "./MisMatchTable";
import UnumMetric from "./UnumMetric";
import YearInput from "./YearInput";
import "./App.css"; // Connect css to react front end


function FileUpload() {
  const [paycom1, setPaycom1] = useState(null);
  const [paycom2, setPaycom2] = useState(null);
  const [health, setHealth] = useState(null);
  const [mismatches, setMismatches] = useState([]);
  const [year, setYear] = useState([]);
  const [month, setMonth] = useState([]); 
  const [provider, setProvider] = useState([]);
  const [unumType, setUnumType] = useState([]);
  const [metric, setMetric] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!paycom1 || !paycom2 || !health) {
      alert("Please upload all three files.");
      return;
    }

    if (!year || !month) {
      alert("Please enter the Year and Month of Health Provider File");
      return;
    }

    if (!provider) {
      alert("Please enter the Health Provider");
      return;
    }

    if (provider == 'unum' && !unumType) {
      alert("You've selected UNUM as a provider. Please also select UNUM type");
      return;
    }

    console.log("Provider =>", provider)

    const formData = new FormData();
    formData.append("paycom1", paycom1);
    formData.append("paycom2", paycom2);
    formData.append("health", health);
    formData.append("year", year);
    formData.append("month", month);
    formData.append("provider", provider);
    formData.append("metric", metric);
    formData.append("unumType", unumType);
    const metadata = {"metric": metric, "provider":provider, "month": month, "year":year, "unumType":unumType}
    console.log("Metadata: ", metadata)
    const response = await fetch("http://localhost:5000/upload", {
      method: "POST",
      body: formData,
    });

    console.log("--------Getting Reponse----------")
    
    const data = await response.json(); // even though response is df this will work

    console.log("--------Reponse Received: ----------", response)


    let columnsOrder = ["eecode", "Name", metric, "Invoice", "difference"];
    if (unumType) {
      columnsOrder = ["eecode", "Name", unumType, "Invoice", "difference"];
    }

    const renamedOrderedData = data.map(row => {
      const payrollKey = Object.keys(row).find(
        key => key !== "eecode" &&
              key !== "Name" &&
              key !== "Invoice" &&
              key !== "difference"
      );

      return {
        eecode: row.eecode,
        Name: row.Name,
        payroll: row[payrollKey],
        Invoice: row.Invoice,
        difference: row.difference
      };
    });

  setMismatches(renamedOrderedData);

  };
  return (
    <div>
      <h1>Upload Paycom + Provider Files</h1>

      <FileDrop label="<Paycom Check Register days 1 - 15>" onFileSelect={setPaycom1} file={paycom1}/>
      {paycom1 && <p>Selected: {paycom1.name}</p>}

      <FileDrop label="<Paycom Check Register days 16- 31>" onFileSelect={setPaycom2} file={paycom2} />
      {paycom2 && <p>Selected: {paycom2.name}</p>}

      <FileDrop label="<Health Provider {Kaiser, Dental, Vision, UHC, CCHP, Landma} Data File>" onFileSelect={setHealth} file={health} />
      {health && <p>Selected: {health.name}</p>}

      <h2> Select Data's Health Provider </h2>
      <HealthProviderButton
        provider={provider}
        setProvider={setProvider}
        metric={metric}
        setMetric={setMetric}
        />

      <h2> If Selected UNUM, pick plan name</h2>
      <UnumMetric
        // metric={metric} Does unumType go here?
        metric={metric}
        setMetric={setMetric}
        unumType={unumType}
        setUnumType={setUnumType}
        >
        
      </UnumMetric>

      <YearInput
        year={year}
        setYear={setYear}
      />

      <YearMonthSelector
        year={year}
        month={month}
        setYear={setYear}
        setMonth={setMonth}
      />

      <button onClick={handleSubmit}>Compare</button>

      <h2>Mismatches:</h2>
      <p> Note: This ignores differences less than $.05 </p>

      <MisMatchTable mismatches={mismatches} />
    </div>
  );
}

export default FileUpload;