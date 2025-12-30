function HealthProviderButton({provider, setProvider, metric, setMetric}) {
    return (
    <div>
        <button onClick={() => {
        setProvider('kaiser');
        setMetric('dkrm');
        }}
        >
             Kaiser 
             </button>

        <button onClick={() => {
            setProvider('dental');
            setMetric('ddnt');
        }}
        > Dental 
        </button>

        <button onClick={() => {
            setProvider('vision');
            setMetric('dvsn');
        }}
        > Vision 
        </button>

        {/* TODO: Check these are okay? */}
        <button onClick={() => {
            setProvider('united_cchp');
            setMetric('dcmp');
        }}
        > CCHP 
        </button>

        <button onClick={() => {
            setProvider('united_cchp');
            setMetric('duhm');
        }}
        > United Health 
        </button>

        <button onClick={() => {
            setProvider('landmark');
            setMetric('dchi');
        }}
        > Landmark
        </button>

        <p> Provider : {provider} </p>
    </div>
);
}

export default HealthProviderButton