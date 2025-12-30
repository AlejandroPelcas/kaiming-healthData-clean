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
  const backgroundColor = file ? "#d3ffd3" : "#fff9b0"; // light green if file, light yellow if none

  return (
    <div
      {...getRootProps()}
      style={{
        border: "2px dashed #999",
        padding: "20px",
        marginBottom: "15px",
        textAlign: "center",
        backgroundColor: backgroundColor,
        cursor: "pointer",
        transition: "background-color 0.2s",
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
