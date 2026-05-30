import React from "react";
import { useDropzone } from "react-dropzone";

function FileDrop({ label, onFileSelect, file }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
  });

  // Background color based on whether a file exists
  const backgroundColor = isDragActive
  ? "#dce9f9"
  : file
  ? "#e8f1fc"
  : "#f8fbff";
  
  return (
    <div
      {...getRootProps()}
      style={{
        border: file
          ? "2px solid #1e4d8f"
          : "2px dashed #4f7cac",
        padding: "20px",
        marginBottom: "15px",
        textAlign: "center",
        backgroundColor,
        borderRadius: "12px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        color: "#112240",
        fontWeight: "500",
      }}
    >
      <input {...getInputProps()} />
      <p>
        {isDragActive
          ? "Drop the file here..."
          : `Drag & drop ${label} here, or click to select`}
      </p>
      {file && <p>Selected: {file.name}</p>}
    </div>
  );
}

export default FileDrop;
