import { CustomCost, ExponentialCost, FirstFreeCost } from "./api/Costs";
import { Localization } from "./api/Localization";
import { parseBigNumber, BigNumber } from "./api/BigNumber";
import { theory } from "./api/Theory";
import { Utils } from "./api/Utils";

requiresGameVersion("1.4.33");

var id = "binomial_distribution";
var name = "Binomial Distribution";
var description =
  "wip";
var authors = "Maimai";
var version = 13;

var tauMultiplier = 4;
var currency;

// state
var q = BigNumber.ZERO;
var t = BigNumber.ZERO; // time (for x=t*q/(...))

// upgrades (order: c1, c2, n, q1, q2)
var c1, c2, n, q1, q2;

// milestones
var msC1Exp;   // #1 c1 exponent ladder (5 levels)
var msSigma;   // #2 Σ expansion
var msQ1Exp;   // #3 q1 exponent ladder (3 levels)
var msTime;    // #4 time factor unlock (x=tq/(1+qdot))

// exponent ladders (internal only)
const C1_EXP_STEPS = [1.00, 1.02, 1.04, 1.06, 1.08, 1.10];
const Q1_EXP_STEPS = [1.00, 1.05, 1.10, 1.15];

var init = () => {
    currency = theory.createCurrency();

    // === c1 (ID 0) — FirstFree, level0=0 ===
    {
        const getDesc = (level) => "c_1=" + getC1(level).toString(0);
        c1 = theory.createUpgrade(0, currency, new FirstFreeCost(new ExponentialCost(50, 3.38 / 1.5)));
        c1.getDescription = () => Utils.getMath(getDesc(c1.level));
        c1.getInfo = (amount) => Utils.getMathTo(getDesc(c1.level), getDesc(c1.level + amount));
    }

    // === c2 (ID 1) ===
    {
        const getDesc = (level) => "c_2=2^{" + level + "}";
        c2 = theory.createUpgrade(1, currency, new ExponentialCost(1e6, 3.38 * 5));
        c2.getDescription = () => Utils.getMath(getDesc(c2.level));
        c2.getInfo = (amount) => Utils.getMathTo(getDesc(c2.level), getDesc(c2.level + amount));
    }

    // === n (ID 2) ===
    {
        const getDesc = (level) => "n=" + level;
        n = theory.createUpgrade(2, currency, new ExponentialCost(1e4, 250));
        n.getDescription = () => Utils.getMath(getDesc(n.level));
        n.getInfo = (amount) => Utils.getMathTo(getDesc(n.level), getDesc(n.level + amount));
    }

    // === q1 (ID 3) ===
    {
        const getDesc = (level) => "q_1=" + getQ1(level).toString(0);
        q1 = theory.createUpgrade(3, currency, new ExponentialCost(15, 3.38 / 3.5));
        q1.getDescription = () => Utils.getMath(getDesc(q1.level));
        q1.getInfo = (amount) => Utils.getMathTo(getDesc(q1.level), getDesc(q1.level + amount));
    }

    // === q2 (ID 4) ===
    {
        const getDesc = (level) => "q_2=2^{" + level + "}";
        q2 = theory.createUpgrade(4, currency, new ExponentialCost(2000, 3.38 * 4));
        q2.getDescription = () => Utils.getMath(getDesc(q2.level));
        q2.getInfo = (amount) => Utils.getMathTo(getDesc(q2.level), getDesc(q2.level + amount));
    }

    // permanents
    theory.createPublicationUpgrade(0, currency, 1e8);
    theory.createBuyAllUpgrade(1, currency, 1e15);
    theory.createAutoBuyerUpgrade(2, currency, 1e25);

    // === milestones ===
    theory.setMilestoneCost(new CustomCost((level) => BigNumber.TEN.pow(50 + 25 * level)));

    // #1: c1 exponent ladder
    msC1Exp = theory.createMilestoneUpgrade(1, 5);
    msC1Exp.description = "Boost c_1";
    msC1Exp.info = "Hidden exponent on c_1 increases stepwise.";
    msC1Exp.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();

    // #2: Σ expansion
    msSigma = theory.createMilestoneUpgrade(2, 1);
    msSigma.description = "Enable binomial Σ expansion";
    msSigma.info = "Switch (1+x)^n → Σ_{k=0}^n C(n,k)x^k";
    msSigma.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();

    // #3: q1 exponent ladder
    msQ1Exp = theory.createMilestoneUpgrade(3, 3);
    msQ1Exp.description = "Boost q_1";
    msQ1Exp.info = "Hidden exponent on q_1 increases stepwise.";
    msQ1Exp.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();

    // #4: enable t factor in x
    msTime = theory.createMilestoneUpgrade(4, 1);
    msTime.description = "Enable time factor in x";
    msTime.info = "x = tq / (1+\\dot q)";
    msTime.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();

    updateAvailability();
};

var updateAvailability = () => {
    c1.isAvailable = true;
    c2.isAvailable = true;
    n.isAvailable = true;
    q1.isAvailable = true;
    q2.isAvailable = true;

    theory.invalidatePrimaryEquation();
};

// ---- helpers ----
var getC1 = (level) => Utils.getStepwisePowerSum(level, 2, 10, 0);
var getC2 = (level) => BigNumber.TWO.pow(BigNumber.from(level));
var getQ1 = (level) => Utils.getStepwisePowerSum(level, 2, 10, 0);
var getQ2 = (level) => BigNumber.TWO.pow(BigNumber.from(level));

// Σ C(n,k)x^k
function binomialSum(nInt, x) {
    if (nInt <= 0) return 1;
    let sum = 1;
    let term = 1;
    for (let k = 1; k <= nInt; ++k) {
        term = (term * (nInt - k + 1)) / k * x;
        sum += term;
    }
    return sum;
}

var tick = (elapsedTime, multiplier) => {
    const dt = BigNumber.from(elapsedTime * multiplier);
    const bonus = theory.publicationMultiplier;

    // advance time
    t = t + dt;

    // hidden exponents
    const alpha_c = C1_EXP_STEPS[Math.min(msC1Exp.level, C1_EXP_STEPS.length - 1)];
    const alpha_q = Q1_EXP_STEPS[Math.min(msQ1Exp.level, Q1_EXP_STEPS.length - 1)];

    // q̇ = q1^α * q2
    const vq1 = getQ1(q1.level).pow(BigNumber.from(alpha_q));
    const vq2 = getQ2(q2.level);
    const qdot = vq1 * vq2;

    // integrate q
    q = q + qdot * dt;

    // x def
    const qNum = q.toNumber();
    const qdotNum = qdot.toNumber();
    const x = (msTime.level > 0) ? t.toNumber() * qNum / (1 + qdotNum)
                                 : qNum / (1 + qdotNum);

    // multipliers
    const vc1 = getC1(c1.level).pow(BigNumber.from(alpha_c));
    const vc2 = getC2(c2.level);

    // driver
    const nInt = Math.max(0, n.level);
    const driver = (msSigma.level > 0)
        ? binomialSum(nInt, x)
        : Math.pow(1 + x, nInt);

    currency.value += bonus * vc1 * vc2 * BigNumber.from(driver) * dt;

    theory.invalidateTertiaryEquation();
};

var getPrimaryEquation = () => {
    const useSigma = msSigma.level > 0;
    const useTime = msTime.level > 0;

    let s = "\\begin{matrix}";
    if (useSigma)
        s += "\\dot{\\rho} = c_1\\,c_2\\,\\sum_{k=0}^{n}\\binom{n}{k}x^k";
    else
        s += "\\dot{\\rho} = c_1\\,c_2\\,(1+x)^n";

    s += ",\\quad x = ";
    s += useTime ? "\\frac{tq}{1+\\dot q}" : "\\frac{q}{1+\\dot q}";
    s += ",\\quad \\dot q = q_1\\,q_2";
    s += "\\end{matrix}";
    return s;
};

var getTertiaryEquation = () => {
    const alpha_q = Q1_EXP_STEPS[Math.min(msQ1Exp.level, Q1_EXP_STEPS.length - 1)];
    const qdotNow = getQ1(q1.level).pow(BigNumber.from(alpha_q)) * getQ2(q2.level);
    const xNow = (msTime.level > 0)
        ? t.toNumber() * q.toNumber() / (1 + qdotNow.toNumber())
        : q.toNumber() / (1 + qdotNow.toNumber());

    let s = "\\begin{matrix}";
    if (msTime.level > 0) s += "t=" + t.toString(3) + ",\\; ";
    s += "q=" + q.toString(3);
    s += ",\\; x=" + xNow.toFixed(3);
    s += "\\end{matrix}";
    return s;
};

// τ / publication
var getPublicationMultiplier = (tau) =>
    tau.isZero ? BigNumber.ONE : tau.pow(BigNumber.from(1.5 / tauMultiplier));
var getPublicationMultiplierFormula = (symbol) => "{"+symbol+"}^{0.375}";
var getTau = () => currency.value.pow(BigNumber.from(0.1 * tauMultiplier));
var getCurrencyFromTau = (tau) => [tau.max(BigNumber.ONE).pow(10 / tauMultiplier), currency.symbol];
var get2DGraphValue = () =>
    currency.value.sign * (BigNumber.ONE + currency.value.abs()).log10().toNumber();

// save/restore
var getInternalState = () => [t, q].join(" ");
var setInternalState = (state) => {
    if (!state) return;
    const v = state.split(" ");
    if (v.length > 0) t = parseBigNumber(v[0]);
    if (v.length > 1) q = parseBigNumber(v[1]);
};
var postPublish = () => {
    t = BigNumber.ZERO;
    q = BigNumber.ZERO;
};

init();
