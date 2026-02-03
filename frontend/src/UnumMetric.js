function UnumMetricButton({metric, setMetric, unumType, setUnumType}) {
    return (
        <div>
            <button onClick={() => {
                setUnumType('devl');
            }}
            > EE LIFE 
            </button>

            <button onClick={() => {
                setUnumType('deva');
            }}
            > EE AD&D 
            </button>

            <button onClick={() => {
                setUnumType('dsvl');
            }}
            > SP LIFE 
            </button>

            <button onClick={() => {
                setUnumType('dsva');
            }}
            > SP AD&D 
            </button>

            <button onClick={() => {
                setUnumType('dcvl');
            }}
            > CH LIFE 
            </button>

            <button onClick={() => {
                setUnumType('dcva');
            }}
            > CH AD&D 
            </button>

            <p> unumType : {unumType} </p>

        </div>
    )
}

export default UnumMetricButton;