function UnumMetricButton({ metric, setMetric, unumType, setUnumType }) {
    return (
        <div>
            <button
                className={unumType === "devl" ? "selected" : ""}
                onClick={() => setUnumType("devl")}
            >
                EE LIFE
            </button>

            <button
                className={unumType === "deva" ? "selected" : ""}
                onClick={() => setUnumType("deva")}
            >
                EE AD&D
            </button>

            <button
                className={unumType === "dsvl" ? "selected" : ""}
                onClick={() => setUnumType("dsvl")}
            >
                SP LIFE
            </button>

            <button
                className={unumType === "dsva" ? "selected" : ""}
                onClick={() => setUnumType("dsva")}
            >
                SP AD&D
            </button>

            <button
                className={unumType === "dcvl" ? "selected" : ""}
                onClick={() => setUnumType("dcvl")}
            >
                CH LIFE
            </button>

            <button
                className={unumType === "dcva" ? "selected" : ""}
                onClick={() => setUnumType("dcva")}
            >
                CH AD&D
            </button>

            <p>unumType: {unumType}</p>
        </div>
    );
}

export default UnumMetricButton;