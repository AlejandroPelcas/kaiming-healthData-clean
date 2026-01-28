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

        {/* Jan 28 adding UNUM buttons */}
        <button onClick={() => {
            setProvider('UNUM');
            setMetric('unum');
        }} 
        > UNUM
        </button>

        {/* <button onClick={() => {
            setProvider('UNUM - EE AD&D');
            setMetric('deva');
        }} 
        > UNUM - EE AD&D
        </button>

        <button onClick={() => {
            setProvider('UNUM - SP LIFE');
            setMetric('dsvl');
        }} 
        > UNUM - SP LIFE
        </button>

        <button onClick={() => {
            setProvider('UNUM - SP AD&D');
            setMetric('dsva');
        }} 
        > UNUM - SP AD&D
        </button>

        <button onClick={() => {
            setProvider('UNUM - CH LIFE');
            setMetric('dcvl');
        }} 
        > UNUM - CH LIFE
        </button>

        <button onClick={() => {
            setProvider('UNUM - CH AD&D');
            setMetric('dcva');
        }} 
        > UNUM - CH AD&D
        </button> */}

        <p> Provider : {provider} </p>
    </div>
);
}

export default HealthProviderButton