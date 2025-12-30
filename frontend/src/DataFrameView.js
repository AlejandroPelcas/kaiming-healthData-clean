import { useEffect, useState } from "react";

function DataFrameView() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/get-data")
      .then((res) => res.json())
      .then((json) => setData(json));
  }, []);

  return (
    <div>
      <h2>DataFrame Data</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default DataFrameView;
