function UnumMetricButton({metric, setMetric, unumType, setUnumType}) {
    return (
        <div>
            <button onClick={() => {
                setUnumType('devl');
            }}
            > devl 
            </button>

            <button onClick={() => {
                setUnumType('deva');
            }}
            > deva 
            </button>

            <button onClick={() => {
                setUnumType('dsvl');
            }}
            > dsvl 
            </button>

            <button onClick={() => {
                setUnumType('dsva');
            }}
            > dsva 
            </button>

            <button onClick={() => {
                setUnumType('dcvl');
            }}
            > dcvl 
            </button>

            <button onClick={() => {
                setUnumType('dcva');
            }}
            > dcva 
            </button>

            <p> unumType : {unumType} </p>

        </div>
    )
}

export default UnumMetricButton;