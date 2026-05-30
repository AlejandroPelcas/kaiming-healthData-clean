function HealthProviderButton({ provider, setProvider, metric, setMetric }) {
    return (
        <div>
            <button
                className={provider === "kaiser" ? "selected" : ""}
                onClick={() => {
                    setProvider("kaiser");
                    setMetric("dkrm");
                }}
            >
                Kaiser
            </button>

            <button
                className={provider === "dental" ? "selected" : ""}
                onClick={() => {
                    setProvider("dental");
                    setMetric("ddnt");
                }}
            >
                Dental
            </button>

            <button
                className={provider === "vision" ? "selected" : ""}
                onClick={() => {
                    setProvider("vision");
                    setMetric("dvsn");
                }}
            >
                Vision
            </button>

            <button
                className={
                    provider === "united_cchp" && metric === "dcmp"
                        ? "selected"
                        : ""
                }
                onClick={() => {
                    setProvider("united_cchp");
                    setMetric("dcmp");
                }}
            >
                CCHP
            </button>

            <button
                className={
                    provider === "united_cchp" && metric === "duhm"
                        ? "selected"
                        : ""
                }
                onClick={() => {
                    setProvider("united_cchp");
                    setMetric("duhm");
                }}
            >
                United Health
            </button>

            <button
                className={provider === "landmark" ? "selected" : ""}
                onClick={() => {
                    setProvider("landmark");
                    setMetric("dchi");
                }}
            >
                Landmark
            </button>

            <button
                className={provider === "unum" ? "selected" : ""}
                onClick={() => {
                    setProvider("unum");
                    setMetric("unum");
                }}
            >
                UNUM
            </button>

            <p>Provider : {provider}</p>
        </div>
    );
}

export default HealthProviderButton;