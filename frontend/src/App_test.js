import React, { useEffect, useState } from "react";

function TestConnection() {
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("http://127.0.0.1:5000/test")
      .then((res) => res.json())
      .then((data) => setMsg(data.message))
      .catch((err) => setMsg("Error: " + err));
  }, []);

  return <div>{msg}</div>;
}

export default TestConnection;