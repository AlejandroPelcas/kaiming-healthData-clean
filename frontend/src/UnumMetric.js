function UnumMetricButton({metric, setMetric}) {
    return (
        <div>
            <button onClick={() => {
                setMetric('devl');
            }}
            > devl 
            </button>

            <button onClick={() => {
                setMetric('deva');
            }}
            > deva 
            </button>

            <button onClick={() => {
                setMetric('dsvl');
            }}
            > dsvl 
            </button>

            <button onClick={() => {
                setMetric('dsva');
            }}
            > dsva 
            </button>

            <button onClick={() => {
                setMetric('dcvl');
            }}
            > dcvl 
            </button>

            <button onClick={() => {
                setMetric('dcva');
            }}
            > dcva 
            </button>

        </div>
    )
}

export default UnumMetricButton;