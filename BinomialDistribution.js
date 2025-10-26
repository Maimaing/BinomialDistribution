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
var version = 14;

var tauMultiplier = 4;
var currency;

// state
var q = BigNumber.ZERO;
var t = BigNumber.ZERO;

// upgrades (c1, c2, n, q1, q2)
var c1, c2, n, q1, q2;

// milestones
var msC1Exp;   // #1 c1 exponent ladder
var msSigma;   // #2 Σ expansion
var msQ1Exp;   // #3 q1 exponent ladder
var msTime;    // #4 unlock x=tq/(1+qdot)

// exponent ladders
const C1_EXP_STEPS = [1.00, 1.02, 1.04, 1.06, 1.08, 1.10];
const Q1_EXP_STEPS = [1.00, 1.05, 1.10, 1.15];

// helper functions
var getC1 = (level) => Utils.getStepwisePowerSum(level, 2, 10, 0);
var getC2 = (level) => BigNumber.TWO.pow(BigNumber.from(level));
var getQ1 = (level) => Utils.getStepwisePowerSum(level, 2, 10, 0);
var getQ2 = (level) => BigNumber.TWO.pow(BigNumber.from(level));
var getN  = (level) => Math.max(1, level + 1);

// binomial sum
function binomialSum(nInt, x) {
    if (nInt <= 0) return 1;
    let sum = 1, term = 1;
    for (let k = 1; k <= nInt; ++k) {
        term = term * (nInt - k + 1) / k * x;
        sum += term;
    }
    return sum;
}

var init = () => {
    currency = theory.createCurrency();

    // === c1 ===
    {
        const getDesc = (level) => "c_1=" + getC1(level).toString(0);
        c1 = theory.createUpgrade(0, currency, new FirstFreeCost(new ExponentialCost(50, 3.38 / 1.5)));
        c1.getDescription = () => Utils.getMath(getDesc(c1.level));
        c1.getInfo = (amount) => Utils.getMathTo(getDesc(c1.level), getDesc(c1.level + amount));
    }

    // === c2 ===
    {
        const getDesc = (level) => "c_2=2^{" + level + "}";
        c2 = theory.createUpgrade(1, currency, new ExponentialCost(1e6, 3.38 * 5));
        c2.getDescription = () => Utils.getMath(getDesc(c2.level));
        c2.getInfo = (amount) => Utils.getMathTo(getDesc(c2.level), getDesc(c2.level + amount));
    }

    // === n ===
    {
        const getDesc = (level) => "n=" + getN(level);
        n = theory.createUpgrade(2, currency, new ExponentialCost(1e3, Math.log(1e4))); // 1000 → ×10000
        n.getDescription = () => Utils.getMath(getDesc(n.level));
        n.getInfo = (amount) => Utils.getMathTo(getDesc(n.level), getDesc(n.level + amount));
    }

    // === q1 ===
    {
        const getDesc = (level) => "q_1=" + getQ1(level).toString(0);
        q1 = theory.createUpgrade(3, currency, new ExponentialCost(15, 3.38 / 3.5));
        q1.getDescription = () => Utils.getMath(getDesc(q1.level));
        q1.getInfo = (amount) => Utils.getMathTo(getDesc(q1.level), getDesc(q1.level + amount));
    }

    // === q2 ===
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

    // milestones
    theory.setMilestoneCost(new CustomCost((level) => BigNumber.TEN.pow(50 + 25 * level)));

    // #1: c1 exponent
    msC1Exp = theory.createMilestoneUpgrade(0, 5);
    msC1Exp.description = "Boost c₁";
    msC1Exp.info = "Increases exponent on c₁.";
    msC1Exp.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();

    // #2: Σ expansion
    msSigma = theory.createMilestoneUpgrade(1, 1);
    msSigma.description = "Enable Σ expansion";
    msSigma.info = "Switches (1+x)ⁿ → Σ₀ⁿ C(n,k)xᵏ.";
    msSigma.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();

    // #3: q1 exponent
    msQ1Exp = theory.createMilestoneUpgrade(2, 3);
    msQ1Exp.description = "Boost q₁";
    msQ1Exp.info = "Increases exponent on q₁.";
    msQ1Exp.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();

    // #4: time factor (hidden until MS#1–#3 all purchased)
    msTime = theory.createMilestoneUpgrade(3, 1);
    msTime.description = "Enable time factor in x";
    msTime.info = "x = tq / (1+\\dot q)";
    msTime.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();

    updateAvailability();
};

var updateAvailability = () => {
    // basic unlocks always available
    c1.isAvailable = c2.isAvailable = n.isAvailable = q1.isAvailable = q2.isAvailable = true;

    // MS#4 only appears after MS#1–#3 all bought
    msTime.isAvailable = (msC1Exp.level == 5 && msSigma.level == 1 && msQ1Exp.level == 3);

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

    const qNum = q.toNumber();
    const qdotNum = qdot.toNumber();
    const x = (msTime.level > 0)
        ? t.toNumber() * qNum / (1 + qdotNum)
        : qNum / (1 + qdotNum);

    const vc1 = getC1(c1.level).pow(BigNumber.from(alpha_c));
    const vc2 = getC2(c2.level);

    const nInt = getN(n.level);
    const driver = (msSigma.level > 0)
        ? binomialSum(nInt, x)
        : Math.pow(1 + x, nInt);

    currency.value += bonus * vc1 * vc2 * BigNumber.from(driver) * dt;
    theory.invalidateTertiaryEquation();
};

var getPrimaryEquation = () => {
    const useSigma = msSigma.level > 0;
    const useTime = msTime.level > 0;
    let s = "\\dot{\\rho} = c_1c_2";
    s += useSigma ? "\\sum_{k=0}^{n}\\binom{n}{k}x^k" : "(1+x)^n";
    s += ",\\quad x=" + (useTime ? "\\frac{tq}{1+\\dot q}" : "\\frac{q}{1+\\dot q}");
    s += ",\\quad \\dot q=q_1q_2";
    return s;
};

var getTertiaryEquation = () => {
    const alpha_q = Q1_EXP_STEPS[Math.min(msQ1Exp.level, Q1_EXP_STEPS.length - 1)];
    const qdotNow = getQ1(q1.level).pow(BigNumber.from(alpha_q)) * getQ2(q2.level);
    const xNow = (msTime.level > 0)
        ? t.toNumber() * q.toNumber() / (1 + qdotNow.toNumber())
        : q.toNumber() / (1 + qdotNow.toNumber());

    let s = "q=" + q.toString(3);
    if (msTime.level > 0) s = "t=" + t.toString(3) + ", " + s;
    s += ", x=" + xNow.toFixed(3);
    return s;
};

// τ / publication
var getPublicationMultiplier = (tau) => tau.isZero ? BigNumber.ONE : tau.pow(BigNumber.from(1.5 / tauMultiplier));
var getPublicationMultiplierFormula = (symbol) => "{"+symbol+"}^{0.375}";
var getTau = () => currency.value.pow(BigNumber.from(0.1 * tauMultiplier));
var getCurrencyFromTau = (tau) => [tau.max(BigNumber.ONE).pow(10 / tauMultiplier), currency.symbol];
var get2DGraphValue = () => currency.value.sign * (BigNumber.ONE + currency.value.abs()).log10().toNumber();

// save / restore
var getInternalState = () => [t, q].join(" ");
var setInternalState = (state) => {
    if (!state) return;
    const v = state.split(" ");
    if (v.length > 0) t = parseBigNumber(v[0]);
    if (v.length > 1) q = parseBigNumber(v[1]);
};
var postPublish = () => { t = BigNumber.ZERO; q = BigNumber.ZERO; };

init();
