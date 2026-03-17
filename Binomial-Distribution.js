import { CustomCost, ExponentialCost, FirstFreeCost } from "./api/Costs";
import { Localization } from "./api/Localization";
import { parseBigNumber, BigNumber } from "./api/BigNumber";
import { theory } from "./api/Theory";
import { Utils } from "./api/Utils";

requiresGameVersion("1.4.33");

var id = "binomial_distribution";
var name = "Binomial Distribution";
var description = "A binomial-theorem-based theory with Σ expansion and time factor milestones.";
var authors = "Maimai";
var version = 22;

var tauMultiplier = 4;
var currency;

var q = BigNumber.ZERO;
var t = BigNumber.ZERO;

var c1, c2, n, q1, q2;

var msC1Exp;
var msSigma;
var msQ1Exp;
var msTime;

const C1_EXP_STEPS = [1.00, 1.02, 1.04, 1.06, 1.08, 1.10];
const Q1_EXP_STEPS = [1.00, 1.05, 1.10, 1.15];

const nCosts = [
    BigNumber.from("1e50"),
    BigNumber.from("1e100"),
    BigNumber.from("1e300"),
    BigNumber.from("1e750"),
    BigNumber.from("1e1250")
];

var getC1 = (level) => Utils.getStepwisePowerSum(level, 2, 10, 0);
var getC2 = (level) => BigNumber.TWO.pow(BigNumber.from(level));
var getQ1 = (level) => Utils.getStepwisePowerSum(level, 2, 10, 0);
var getQ2 = (level) => BigNumber.TWO.pow(BigNumber.from(level));
var getN  = (level) => Math.max(1, level + 1);

function binomialSumBN(nInt, baseVal) {
    if (nInt <= 0) return BigNumber.ONE;
    let sum = BigNumber.ONE;
    let term = BigNumber.ONE;
    for (let k = 1; k <= nInt; ++k) {
        term = term * BigNumber.from(nInt - k + 1) / BigNumber.from(k) * baseVal;
        sum = sum + term;
    }
    return sum;
}

var init = () => {
    currency = theory.createCurrency();

    // c1 
    {
        const getDesc = (level) => "c_1=" + getC1(level).toString(0);
        c1 = theory.createUpgrade(0, currency, new FirstFreeCost(new ExponentialCost(10, Math.log2(4.4))));
        c1.getDescription = () => Utils.getMath(getDesc(c1.level));
        c1.getInfo = (amount) => Utils.getMathTo(getDesc(c1.level), getDesc(c1.level + amount));
    }

    // c2 
    {
        const getDesc = (level) => "c_2=2^{" + level + "}";
        c2 = theory.createUpgrade(1, currency, new ExponentialCost(150, Math.log2(111)));
        c2.getDescription = () => Utils.getMath(getDesc(c2.level));
        c2.getInfo = (amount) => Utils.getMathTo(getDesc(c2.level), getDesc(c2.level + amount));
    }

    // n
    {
        const getDesc = (level) => "n=" + getN(level);
        n = theory.createUpgrade(2, currency, new CustomCost((level) => {
            if (level < nCosts.length) {
                return nCosts[level];
            }
            return BigNumber.from("1e9999");
        }));
        n.maxLevel = 5;
        n.getDescription = () => Utils.getMath(getDesc(n.level));
        n.getInfo = (amount) => Utils.getMathTo(getDesc(n.level), getDesc(n.level + amount));
    }

    // q1 
    {
        const getDesc = (level) => "q_1=" + getQ1(level).toString(0);
        q1 = theory.createUpgrade(3, currency, new ExponentialCost(1000, Math.log2(7.7)));
        q1.getDescription = () => Utils.getMath(getDesc(q1.level));
        q1.getInfo = (amount) => Utils.getMathTo(getDesc(q1.level), getDesc(q1.level + amount));
    }

    // q2
    {
        const getDesc = (level) => "q_2=2^{" + level + "}";
        q2 = theory.createUpgrade(4, currency, new ExponentialCost(1e6, Math.log2(69)));
        q2.getDescription = () => Utils.getMath(getDesc(q2.level));
        q2.getInfo = (amount) => Utils.getMathTo(getDesc(q2.level), getDesc(q2.level + amount));
    }

    theory.createPublicationUpgrade(0, currency, 1e8);
    theory.createBuyAllUpgrade(1, currency, 1e15);
    theory.createAutoBuyerUpgrade(2, currency, 1e25);

    {
        free = theory.createSingularUpgrade(1,currency,new FreeCost());
        free.bought = (amount) => getFreeCurrency();
        free.description = "Test: Get \\(e5\\rho\\) free";
    }
    

    theory.setMilestoneCost(new CustomCost((level) => {
        switch(level) {
            case 0: return BigNumber.from(8);    // rho 1e20  -> tau 1e8
            case 1: return BigNumber.from(16);   // rho 1e40  -> tau 1e16
            case 2: return BigNumber.from(24);   // rho 1e60  -> tau 1e24
            case 3: return BigNumber.from(32);   // rho 1e80  -> tau 1e32
            case 4: return BigNumber.from(40);   // rho 1e100 -> tau 1e40
            case 5: return BigNumber.from(80);   // rho 1e200 -> tau 1e80
            case 6: return BigNumber.from(120);  // rho 1e300 -> tau 1e120
            case 7: return BigNumber.from(160);  // rho 1e400 -> tau 1e160
            case 8: return BigNumber.from(200);  // rho 1e500 -> tau 1e200
            case 9: return BigNumber.from(400);  // rho 1e1000 -> tau 1e400
            default: return BigNumber.from(400);
        }
    }));

    msC1Exp = theory.createMilestoneUpgrade(0, 5);
    msC1Exp.description = Localization.getUpgradeIncCustomExpDesc("c_1", "0.02");
    msC1Exp.info = "Increases exponent on c₁.";
    msC1Exp.boughtOrRefunded = (_) => { theory.invalidatePrimaryEquation(); updateAvailability(); };

    msQ1Exp = theory.createMilestoneUpgrade(2, 3);
    msQ1Exp.description = "Boost q₁";
    msQ1Exp.info = Localization.getUpgradeIncCustomExpDesc("q_1", "0.05");
    msQ1Exp.boughtOrRefunded = (_) => { theory.invalidatePrimaryEquation(); updateAvailability(); };

    msSigma = theory.createMilestoneUpgrade(1, 1);
    msSigma.description = "Enable Σ expansion";
    msSigma.info = "Switches (1+base)ⁿ → Σ₀ⁿ C(n,k)baseᵏ.";
    msSigma.boughtOrRefunded = (_) => { theory.invalidatePrimaryEquation(); updateAvailability(); };

    msTime = theory.createMilestoneUpgrade(3, 1);
    msTime.description = "Change base term to tq";
    msTime.info = "Changes the base term in the power/sum from q to tq";
    msTime.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();

    updateAvailability();
};

var updateAvailability = () => {
    c1.isAvailable = c2.isAvailable = n.isAvailable = q1.isAvailable = q2.isAvailable = true;

    msSigma.isAvailable = (msC1Exp.level == 5 && msQ1Exp.level == 3);
    msTime.isAvailable = (msSigma.level == 1);
    
    theory.invalidatePrimaryEquation();
};

var tick = (elapsedTime, multiplier) => {
    const dt = BigNumber.from(elapsedTime * multiplier);
    const bonus = theory.publicationMultiplier;

    t = t + dt;

    const alpha_c = C1_EXP_STEPS[Math.min(msC1Exp.level, C1_EXP_STEPS.length - 1)];
    const alpha_q = Q1_EXP_STEPS[Math.min(msQ1Exp.level, Q1_EXP_STEPS.length - 1)];

    const vq1 = getQ1(q1.level).pow(BigNumber.from(alpha_q));
    const vq2 = getQ2(q2.level);
    const qdot = vq1 * vq2;
    q = q + qdot * dt;

    let baseVal = (msTime.level > 0) ? t * q : q;

    const vc1 = getC1(c1.level).pow(BigNumber.from(alpha_c));
    const vc2 = getC2(c2.level);
    const nInt = getN(n.level);
    
    const driverBN = (msSigma.level > 0)
        ? binomialSumBN(nInt, baseVal)
        : (BigNumber.ONE + baseVal).pow(BigNumber.from(nInt));

    currency.value += bonus * vc1 * vc2 * driverBN * dt;

    theory.invalidateTertiaryEquation();
};

var getPrimaryEquation = () => {
    const useSigma = msSigma.level > 0;
    const useTime = msTime.level > 0;
    const innerVar = useTime ? "tq" : "q";

    let s = "\\dot{\\rho} = c_1c_2";
    
    if (useSigma) {
        s += "\\sum_{k=0}^{n}\\binom{n}{k}(" + innerVar + ")^k";
    } else {
        s += "(1+" + innerVar + ")^n";
    }

    s += ",\\quad \\dot q=q_1q_2";
    return s;
};

var getTertiaryEquation = () => {
    let s = "q=" + q.toString(3);
    if (msTime.level > 0) {
        s += ", t=" + t.toString(3);
    }
    return s;
};

var getPublicationMultiplier = (tau) => tau.isZero ? BigNumber.ONE : tau.pow(BigNumber.from(1.5 / tauMultiplier));
var getPublicationMultiplierFormula = (symbol) => "{"+symbol+"}^{0.375}";
var getTau = () => currency.value.pow(BigNumber.from(0.1 * tauMultiplier));
var getCurrencyFromTau = (tau) => [tau.max(BigNumber.ONE).pow(10 / tauMultiplier), currency.symbol];
var get2DGraphValue = () => currency.value.sign * (BigNumber.ONE + currency.value.abs()).log10().toNumber();

var getInternalState = () => [t, q].join(" ");
var setInternalState = (state) => {
    if (!state) return;
    const v = state.split(" ");
    if (v.length > 0) t = parseBigNumber(v[0]);
    if (v.length > 1) q = parseBigNumber(v[1]);
};
var postPublish = () => { t = BigNumber.ZERO; q = BigNumber.ZERO; };

var getFreeCurrency = () => currency.value *= BigNumber.from(1e5);


init();
