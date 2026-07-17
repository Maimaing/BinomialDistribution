import { CustomCost, ExponentialCost, FirstFreeCost } from "./api/Costs";
import { Localization } from "./api/Localization";
import { BigNumber, parseBigNumber } from "./api/BigNumber";
import { theory } from "./api/Theory";
import { Utils } from "./api/Utils";

var id = "binomial_distribution";
var name = "Binomial Distribution";
var description =
    "Build rows of Pascal's triangle and use their binomial coefficients to grow rho. " +
    "The position k advances toward the central coefficient of row n. Later milestones " +
    "strengthen Pascal's identity, accumulate a symmetric partial row sum, and refine " +
    "its higher moments near the end of the theory.";
var authors = "Maimai";
var version = 4;
var releaseOrder = "10";

requiresGameVersion("1.4.33");

// Balancing constants. The companion simulator uses the same values.
var TAU_EXPONENT = 0.4;
var PUBLICATION_EXPONENT = 0.375;
var K_TIME_DIVISOR = 60;
var SYMMETRY_STEP = 0.25;
var FULL_ROW_STEPS = 4;
var LATE_BOOST_STEP = 0.05;
var MILESTONE_COSTS = [4, 10, 25, 45, 65, 90, 130, 190, 250, 310, 340, 370, 400, 425, 445, 455, 465, 475, 485, 510, 535, 560, 585];

var currency;
var a1, a2, b1, b2, c1, c2, n;
var a1Exp, b2Term, c2Term, pascalBoost, symmetry, fullRow, lateBoost;

// q and k are reset on publication. The cached term is derived from n, floor(k),
// and the milestones, so it does not need to be saved.
var q = BigNumber.ONE;
var k = BigNumber.ZERO;
var cachedRowTerm = BigNumber.ONE;
var rowTermIsDirty = true;

var init = () => {
    currency = theory.createCurrency();

    // a1
    {
        let getDesc = (level) => "a_1=" + getA1(level).toString(0);
        a1 = theory.createUpgrade(0, currency, new FirstFreeCost(new ExponentialCost(10, 0.82)));
        a1.getDescription = (_) => Utils.getMath(getDesc(a1.level));
        a1.getInfo = (amount) => Utils.getMathTo(getDesc(a1.level), getDesc(a1.level + amount));
    }

    // a2
    {
        let getDesc = (level) => "a_2=2^{" + level + "}";
        a2 = theory.createUpgrade(1, currency, new ExponentialCost(1e3, 9));
        a2.getDescription = (_) => Utils.getMath(getDesc(a2.level));
        a2.getInfo = (amount) => Utils.getMathTo(getDesc(a2.level), getDesc(a2.level + amount));
    }

    // b1
    {
        let getDesc = (level) => "b_1=" + getB1(level).toString(0);
        b1 = theory.createUpgrade(2, currency, new ExponentialCost(1e4, 0.95));
        b1.getDescription = (_) => Utils.getMath(getDesc(b1.level));
        b1.getInfo = (amount) => Utils.getMathTo(getDesc(b1.level), getDesc(b1.level + amount));
    }

    // b2
    {
        let getDesc = (level) => "b_2=2^{" + level + "}";
        b2 = theory.createUpgrade(3, currency, new ExponentialCost(1e15, 11));
        b2.getDescription = (_) => Utils.getMath(getDesc(b2.level));
        b2.getInfo = (amount) => Utils.getMathTo(getDesc(b2.level), getDesc(b2.level + amount));
    }

    // c1
    {
        let getDesc = (level) => "c_1=" + getC1(level).toString(0);
        c1 = theory.createUpgrade(4, currency, new ExponentialCost(50, 1.015));
        c1.getDescription = (_) => Utils.getMath(getDesc(c1.level));
        c1.getInfo = (amount) => Utils.getMathTo(getDesc(c1.level), getDesc(c1.level + amount));
    }

    // c2
    {
        let getDesc = (level) => "c_2=2^{" + level + "}";
        c2 = theory.createUpgrade(5, currency, new ExponentialCost(1e25, 10.15));
        c2.getDescription = (_) => Utils.getMath(getDesc(c2.level));
        c2.getInfo = (amount) => Utils.getMathTo(getDesc(c2.level), getDesc(c2.level + amount));
    }

    // n (the row of Pascal's triangle)
    {
        let getDesc = (level) => "n=" + getNNumber(level);
        n = theory.createUpgrade(6, currency, new ExponentialCost(20, 2.5615));
        n.getDescription = (_) => Utils.getMath(getDesc(n.level));
        n.getInfo = (amount) => Utils.getMathTo(getDesc(n.level), getDesc(n.level + amount));
        n.bought = (_) => rowTermIsDirty = true;
    }

    theory.createPublicationUpgrade(0, currency, 1e8);
    theory.createBuyAllUpgrade(1, currency, 1e15);
    theory.createAutoBuyerUpgrade(2, currency, 1e25);

    theory.setMilestoneCost(new CustomCost((level) =>
        BigNumber.from(MILESTONE_COSTS[Math.min(level, MILESTONE_COSTS.length - 1)])));

    // The dependency chain makes the simple simulator strategy deterministic.
    {
        a1Exp = theory.createMilestoneUpgrade(0, 3);
        a1Exp.description = Localization.getUpgradeIncCustomExpDesc("a_1", "0.05");
        a1Exp.info = Localization.getUpgradeIncCustomExpInfo("a_1", "0.05");
        a1Exp.boughtOrRefunded = (_) => {
            theory.invalidatePrimaryEquation();
            updateAvailability();
        };
        a1Exp.canBeRefunded = (_) => pascalBoost.level === 0;
    }

    {
        b2Term = theory.createMilestoneUpgrade(1, 1);
        b2Term.description = Localization.getUpgradeAddTermDesc("b_2");
        b2Term.info = Localization.getUpgradeAddTermInfo("b_2");
        b2Term.boughtOrRefunded = (_) => {
            theory.invalidatePrimaryEquation();
            updateAvailability();
        };
        b2Term.canBeRefunded = (_) => c2Term.level === 0;
    }

    {
        c2Term = theory.createMilestoneUpgrade(2, 1);
        c2Term.description = Localization.getUpgradeAddTermDesc("c_2");
        c2Term.info = Localization.getUpgradeAddTermInfo("c_2");
        c2Term.boughtOrRefunded = (_) => {
            theory.invalidatePrimaryEquation();
            updateAvailability();
        };
        c2Term.canBeRefunded = (_) => a1Exp.level === 0;
    }

    {
        pascalBoost = theory.createMilestoneUpgrade(3, 4);
        pascalBoost.getDescription = (_) => Utils.getMath("\\dot q\\times(n+1)^{0.25}");
        pascalBoost.getInfo = (_) => Utils.getMath("\\text{Increase the exponent of }(n+1)\\text{ by }0.25");
        pascalBoost.boughtOrRefunded = (_) => {
            rowTermIsDirty = true;
            theory.invalidatePrimaryEquation();
            theory.invalidateSecondaryEquation();
            updateAvailability();
        };
        pascalBoost.canBeRefunded = (_) => symmetry.level === 0;
    }

    {
        symmetry = theory.createMilestoneUpgrade(4, 6);
        symmetry.getDescription = (_) => Utils.getMath("\\dot k\\times10^{0.25},\\quad\\dot q\\times(n+1)^{0.25}");
        symmetry.getInfo = (_) => Utils.getMath("\\text{Use Pascal symmetry to improve }k\\text{ and }q");
        symmetry.boughtOrRefunded = (_) => {
            rowTermIsDirty = true;
            theory.invalidatePrimaryEquation();
            theory.invalidateSecondaryEquation();
            updateAvailability();
        };
        symmetry.canBeRefunded = (_) => fullRow.level === 0;
    }

    {
        fullRow = theory.createMilestoneUpgrade(5, FULL_ROW_STEPS);
        fullRow.getDescription = (_) => Utils.getMath("\\binom{n}{k}\\to S(n,k),\\quad S(n,k_c)=2^n");
        fullRow.getInfo = (_) => Utils.getMath("\\text{Approach the symmetric partial row sum in four steps}");
        fullRow.boughtOrRefunded = (_) => {
            rowTermIsDirty = true;
            theory.invalidatePrimaryEquation();
            updateAvailability();
        };
        fullRow.canBeRefunded = (_) => lateBoost.level === 0;
    }

    {
        lateBoost = theory.createMilestoneUpgrade(6, 4);
        lateBoost.getDescription = (_) => Utils.getMath("\\dot q\\times(n+1)^{0.05}");
        lateBoost.getInfo = (_) => Utils.getMath("\\text{Refine higher binomial moments by increasing the }(n+1)\\text{ exponent}");
        lateBoost.boughtOrRefunded = (_) => {
            rowTermIsDirty = true;
            theory.invalidatePrimaryEquation();
            theory.invalidateSecondaryEquation();
            updateAvailability();
        };
    }

    updateAvailability();
};

var updateAvailability = () => {
    b2.isAvailable = b2Term.level > 0;
    c2.isAvailable = c2Term.level > 0;

    b2Term.isAvailable = true;
    c2Term.isAvailable = b2Term.level === b2Term.maxLevel;
    a1Exp.isAvailable = c2Term.level === c2Term.maxLevel;
    pascalBoost.isAvailable = a1Exp.level === a1Exp.maxLevel;
    symmetry.isAvailable = pascalBoost.level === pascalBoost.maxLevel;
    fullRow.isAvailable = symmetry.level === symmetry.maxLevel;
    lateBoost.isAvailable = fullRow.level === fullRow.maxLevel;
};

var getNNumber = (level) => level + 1;
var getA1 = (level) => Utils.getStepwisePowerSum(level, 2, 10, 0);
var getA2 = (level) => BigNumber.TWO.pow(BigNumber.from(level));
var getB1 = (level) => Utils.getStepwisePowerSum(level, 2, 10, 0);
var getB2 = (level) => BigNumber.TWO.pow(BigNumber.from(level));
var getC1 = (level) => Utils.getStepwisePowerSum(level, 2, 10, 1);
var getC2 = (level) => BigNumber.TWO.pow(BigNumber.from(level));
var getA1Exponent = () => 1 + 0.05 * a1Exp.level;
var getPolynomialExponent = () =>
    0.25 * pascalBoost.level + SYMMETRY_STEP * symmetry.level + LATE_BOOST_STEP * lateBoost.level;

// Builds C(n,i) successively with C(n,i)=C(n,i-1)(n-i+1)/i, so the
// coefficient and symmetric partial sum are obtained in one pass.
var getRowTerms = (row, position) => {
    let mirroredPosition = Math.min(position, row - position);
    let coefficient = BigNumber.ONE;
    let halfSum = BigNumber.ONE;
    for (let i = 1; i <= mirroredPosition; ++i) {
        coefficient = coefficient * BigNumber.from(row - i + 1) / BigNumber.from(i);
        halfSum += coefficient;
    }
    let target = Math.floor(row / 2);
    let partialSum = position >= target
        ? BigNumber.TWO.pow(BigNumber.from(row))
        : BigNumber.TWO * halfSum;
    return { coefficient, partialSum };
};

var updateRowTerm = () => {
    let row = getNNumber(n.level);
    let target = Math.floor(row / 2);
    let position = Math.min(target, Math.floor(k.toNumber()));
    let terms = getRowTerms(row, position);
    let fullRowFraction = fullRow.level / fullRow.maxLevel;
    let baseTerm = fullRow.level === 0
        ? terms.coefficient
        : fullRow.level === fullRow.maxLevel
            ? terms.partialSum
            : terms.coefficient.pow(1 - fullRowFraction)
                * terms.partialSum.pow(fullRowFraction);
    cachedRowTerm = baseTerm * BigNumber.from(row + 1).pow(getPolynomialExponent());
    rowTermIsDirty = false;
};

var tick = (elapsedTime, multiplier) => {
    let dt = BigNumber.from(elapsedTime * multiplier);
    let row = getNNumber(n.level);
    let target = Math.floor(row / 2);
    let previousPosition = Math.floor(k.toNumber());

    if (previousPosition < target) {
        let vc2 = c2Term.level > 0 ? getC2(c2.level) : BigNumber.ONE;
        let symmetrySpeed = BigNumber.TEN.pow(SYMMETRY_STEP * symmetry.level);
        let dk = dt * getC1(c1.level) * vc2 * symmetrySpeed / BigNumber.from(K_TIME_DIVISOR);
        k = (k + dk).min(BigNumber.from(target));
        if (Math.floor(k.toNumber()) !== previousPosition) rowTermIsDirty = true;
    }

    if (rowTermIsDirty) updateRowTerm();

    let vb2 = b2Term.level > 0 ? getB2(b2.level) : BigNumber.ONE;
    let vc2 = c2Term.level > 0 ? getC2(c2.level) : BigNumber.ONE;
    let variableTerm = (getB1(b1.level) * vb2 * getC1(c1.level) * vc2).pow(0.5);
    q += dt * variableTerm * cachedRowTerm;

    let production = theory.publicationMultiplier
        * getA1(a1.level).pow(getA1Exponent())
        * getA2(a2.level)
        * q;
    currency.value += dt * production;

    theory.invalidateTertiaryEquation();
};

var getInternalState = () => JSON.stringify({
    version: 1,
    q: q.toString(),
    k: k.toString()
});

var setInternalState = (stateString) => {
    if (!stateString) return;
    try {
        let state = JSON.parse(stateString);
        q = parseBigNumber(state.q ?? "1");
        k = parseBigNumber(state.k ?? "0");
    } catch (_) {
        // Compatibility with an early space-separated development save.
        let values = stateString.split(" ");
        if (values.length > 0 && values[0]) q = parseBigNumber(values[0]);
        if (values.length > 1 && values[1]) k = parseBigNumber(values[1]);
    }
    rowTermIsDirty = true;
};

var postPublish = () => {
    q = BigNumber.ONE;
    k = BigNumber.ZERO;
    cachedRowTerm = BigNumber.ONE;
    rowTermIsDirty = true;
};

var getPrimaryEquation = () => {
    theory.primaryEquationHeight = 120;
    let a1Power = a1Exp.level > 0 ? "^{" + getA1Exponent().toFixed(2) + "}" : "";
    let b2Factor = b2Term.level > 0 ? "b_2" : "";
    let c2Factor = c2Term.level > 0 ? "c_2" : "";
    let fullRowFraction = fullRow.level / fullRow.maxLevel;
    let rowFactor = fullRow.level === 0
        ? "\\binom{n}{\\lfloor k \\rfloor}"
        : fullRow.level === fullRow.maxLevel
            ? "S(n,\\lfloor k \\rfloor)"
            : "\\binom{n}{\\lfloor k \\rfloor}^{" + (1 - fullRowFraction).toFixed(2) + "}S(n,\\lfloor k \\rfloor)^{" + fullRowFraction.toFixed(2) + "}";
    let polynomial = getPolynomialExponent() > 0
        ? "(n+1)^{" + getPolynomialExponent().toFixed(2) + "}"
        : "";
    let symmetryFactor = symmetry.level > 0 ? "10^{" + (SYMMETRY_STEP * symmetry.level).toFixed(2) + "}" : "";

    return "\\begin{aligned}" +
        "\\dot\\rho&=m a_1" + a1Power + "a_2q\\\\ " +
        "\\dot q&=\\left(b_1" + b2Factor + "c_1" + c2Factor + "\\right)^{1/2}\\left(" + rowFactor + "\\right)" + polynomial + "\\\\ " +
        "\\dot k&=\\frac{c_1" + c2Factor + symmetryFactor + "}{60},\\quad 0\\le k\\le\\left\\lfloor \\frac{n}{2} \\right\\rfloor" +
        "\\end{aligned}";
};

var getSecondaryEquation = () => {
    return theory.latexSymbol + "=\\rho^{0.4},\\quad m=" + theory.latexSymbol +
        "^{0.375},\\quad (1+x)^n=\\sum_{j=0}^{n}\\binom{n}{j}x^j";
};

var getTertiaryEquation = () => {
    let row = getNNumber(n.level);
    let target = Math.floor(row / 2);
    let position = Math.min(target, Math.floor(k.toNumber()));
    return "\\begin{aligned}" +
        "q&=" + q.toString(3) + "\\\\ " +
        "n&=" + row + ",\\quad k=" + position + ",\\quad k_c=" + target + "\\\\ " +
        "F_{n,k}&=" + cachedRowTerm.toString(3) +
        "\\end{aligned}";
};

var getPublicationMultiplier = (tau) => tau.isZero
    ? BigNumber.ONE
    : tau.pow(PUBLICATION_EXPONENT);
var getPublicationMultiplierFormula = (symbol) => symbol + "^{0.375}";
var getTau = () => currency.value.pow(TAU_EXPONENT);
var getCurrencyFromTau = (tau) => [tau.max(BigNumber.ONE).pow(1 / TAU_EXPONENT), currency.symbol];
var get2DGraphValue = () => currency.value.sign * (BigNumber.ONE + currency.value.abs()).log10().toNumber();

init();
