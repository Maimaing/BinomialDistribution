import { CustomCost, ExponentialCost, FirstFreeCost } from "./api/Costs";
import { BigNumber, parseBigNumber } from "./api/BigNumber";
import { theory } from "./api/Theory";
import { Utils } from "./api/Utils";

var id = "binomial_distribution";
var name = "Binomial Distribution";
var description = "Explore Pascal's triangle, collect symmetric row sums, and unlock the second and fourth moments of the binomial distribution. Balance production against progress toward the centre of each row.";
var authors = "Maimai";
var version = 6;
var releaseOrder = "10";
requiresGameVersion("1.4.33");

// Revision 6 is based on the published revision 4. It has no alternating phase.
var TAU_EXPONENT = 0.4;
var PUBLICATION_EXPONENT = 0.375;
var K_TIME_DIVISOR = 180;
var N_COST_SLOPE = 2.5746;
var MILESTONE_COSTS = [4,10,25,45,65,130,190,250,310,340,370,400,425,455,485,535,585];
var currency;
var a1, a2, b1, b2, c1, c2, n;
var a1Exp, b2Term, c2Term, pascalBoost, cExponent, fullRow, refinement, variance, fourthMoment;
var q = BigNumber.ONE;
var k = BigNumber.ZERO;
var cachedRowTerm = BigNumber.ONE;
var rowTermIsDirty = true;
var upgrades = [];
var milestoneOrder = [];

var getA1 = level => Utils.getStepwisePowerSum(level,2,10,0);
var getB1 = level => Utils.getStepwisePowerSum(level,2,10,0);
var getC1 = level => Utils.getStepwisePowerSum(level,2,10,1);
var powerOfTwo = level => BigNumber.TWO.pow(BigNumber.from(level));
var getEta = () => 1 + 0.01*cExponent.level;
var getNNumber = level => level+1;

var makeUpgrade = (index,symbol,base,slope,getValue,free,powerBase) => {
    let cost = new ExponentialCost(base,slope);
    let upgrade = theory.createUpgrade(index,currency,free ? new FirstFreeCost(cost) : cost);
    upgrade.getDescription = (amount) => Utils.getMath(symbol+"="+(powerBase?powerBase+"^{"+upgrade.level+"}":getValue(upgrade.level).toString(0)));
    upgrade.getInfo = amount => Utils.getMathTo(symbol+"="+getValue(upgrade.level).toString(0),symbol+"="+getValue(upgrade.level+amount).toString(0));
    upgrade.bought = (amount) => {rowTermIsDirty=true;};
    upgrades.push(upgrade);
    return upgrade;
};
var makeMilestone = (index,max,description,info) => {
    let upgrade = theory.createMilestoneUpgrade(index,max);
    upgrade.description=description;
    upgrade.info=info;
    upgrade.boughtOrRefunded=(amount) => {
        rowTermIsDirty=true;
        theory.invalidatePrimaryEquation();
        theory.invalidateSecondaryEquation();
        updateAvailability();
    };
    return upgrade;
};
var updateAvailability = () => {
    b2.isAvailable=b2Term.level>0;
    c2.isAvailable=c2Term.level>0;
    for(let i=0;i<milestoneOrder.length;i++) {
        let current=milestoneOrder[i];
        current.isAvailable=i===0||milestoneOrder[i-1].level===milestoneOrder[i-1].maxLevel;
        current.canBeRefunded=(amount) => i===milestoneOrder.length-1||milestoneOrder[i+1].level===0;
    }
};
var init = () => {
    currency=theory.createCurrency();
    a1=makeUpgrade(0,"a_1",10,0.82,getA1,true);
    a2=makeUpgrade(1,"a_2",1e3,9,powerOfTwo,false,2);
    b1=makeUpgrade(2,"b_1",1e4,0.95,getB1,false);
    b2=makeUpgrade(3,"b_2",1e15,11,powerOfTwo,false,2);
    c1=makeUpgrade(4,"c_1",50,1.015,getC1,false);
    c2=makeUpgrade(5,"c_2",1e25,10.15,powerOfTwo,false,2);
    n=makeUpgrade(6,"n",20,N_COST_SLOPE,level=>BigNumber.from(level+1),false);
    theory.createPublicationUpgrade(0,currency,1e8);
    theory.createBuyAllUpgrade(1,currency,1e15);
    theory.createAutoBuyerUpgrade(2,currency,1e25);
    theory.setMilestoneCost(new CustomCost(level=>BigNumber.from(MILESTONE_COSTS[Math.min(level,MILESTONE_COSTS.length-1)])));
    a1Exp=makeMilestone(0,3,"Production exponent","Increase the exponent of a1 by 0.05.");
    b2Term=makeMilestone(1,1,"Unlock "+Utils.getMath("b_2"),"Include "+Utils.getMath("b_2")+" in "+Utils.getMath("B")+" and enable its upgrade.");
    c2Term=makeMilestone(2,1,"Unlock "+Utils.getMath("c_2"),"Include "+Utils.getMath("c_2")+" in "+Utils.getMath("C")+" and enable its upgrade.");
    pascalBoost=makeMilestone(3,1,"Pascal growth","Multiply row production by n+1.");
    cExponent=makeMilestone(4,6,"Concentration exponent "+Utils.getMath("\\eta"),"eta = 1.000 + 0.010 times L, where L is this milestone's level (0-6). Maximum: 1.060. Eta affects both q production and k progress.");
    cExponent.getInfo = (amount) => {
        let nextLevel=Math.min(cExponent.maxLevel,Math.max(0,cExponent.level+amount));
        let nextEta=1+0.01*nextLevel;
        return "eta = 1.000 + 0.010 times L, where L is this milestone's level (0-6). Maximum: 1.060. "+
            "Current: L="+cExponent.level+", eta="+getEta().toFixed(3)+". "+
            "After purchase: L="+nextLevel+", eta="+nextEta.toFixed(3)+". "+
            "Eta affects both q production and k progress.";
    };
    fullRow=makeMilestone(5,1,"Symmetric row sum","Replace the current coefficient with S0, the sum of coefficients collected at both ends of the row. The centre is counted only once.");
    refinement=makeMilestone(6,2,"Fourth-moment refinement","Decrease nu by 0.1 to strengthen M4. Its denominator is (n + 1) raised to nu. Initially nu is 2.");
    variance=makeMilestone(7,1,"Second central moment","Add M2: four times S2 divided by (n + 1). S2 sums squared distances from the row centre, weighted by the collected binomial coefficients.");
    fourthMoment=makeMilestone(8,1,"Fourth central moment","Add M4: sixteen times S4 divided by (n + 1) raised to nu. S4 sums fourth powers of distances from the row centre, weighted by the collected coefficients. Nu starts at 2; each refinement reduces it by 0.1.");
    milestoneOrder=[b2Term,c2Term,a1Exp,pascalBoost,cExponent,fullRow,variance,fourthMoment,refinement];
    updateAvailability();
};

// The selected set contains both ends of the row, without double counting
// the centre. Raw moments have nonnegative summands, so progress cannot
// reduce production. At the centre, exact binomial moment identities apply.
var getRowTerms = (row,position) => {
    let target=Math.floor(row/2),pos=Math.min(target,Math.max(0,Math.floor(position)));
    let coefficient=BigNumber.ONE;
    let sum=BigNumber.ZERO,second=BigNumber.ZERO,fourth=BigNumber.ZERO;
    for(let j=0;j<=pos;j++) {
        if(j>0)coefficient=coefficient*BigNumber.from(row-j+1)/BigNumber.from(j);
        let copies=(2*j===row)?1:2;
        let term=coefficient*BigNumber.from(copies);
        let distance=j-row/2;
        sum+=term;
        second+=term*BigNumber.from(distance*distance);
        fourth+=term*BigNumber.from(Math.pow(distance,4));
    }
    if(pos===target) {
        sum=powerOfTwo(row);
        second=sum*BigNumber.from(row/4);
        fourth=sum*BigNumber.from((3*row*row-2*row)/16);
    }
    return {coefficient,sum,second,fourth};
};
var updateRowTerm = () => {
    let row=n.level+1,target=Math.floor(row/2);
    let position=Math.min(target,Math.floor(k.toNumber()));
    let terms=getRowTerms(row,position);
    let reward=fullRow.level>0?terms.sum:terms.coefficient;
    if(variance.level>0)reward+=BigNumber.from(4)*terms.second/BigNumber.from(row+1);
    if(fourthMoment.level>0)reward+=BigNumber.from(16)*terms.fourth/BigNumber.from(row+1).pow(2-0.1*refinement.level);
    if(pascalBoost.level>0)reward*=BigNumber.from(row+1);
    cachedRowTerm=reward;
    rowTermIsDirty=false;
};
var tick = (elapsedTime,multiplier) => {
    let dt=BigNumber.from(elapsedTime*multiplier);
    let B=getB1(b1.level)*(b2Term.level>0?powerOfTwo(b2.level):BigNumber.ONE);
    let C=getC1(c1.level)*(c2Term.level>0?powerOfTwo(c2.level):BigNumber.ONE);
    let target=Math.floor((n.level+1)/2),oldPosition=Math.floor(k.toNumber());
    k=(k+dt*(C/(BigNumber.ONE+B)).pow(getEta())/BigNumber.from(K_TIME_DIVISOR)).min(BigNumber.from(target));
    if(Math.floor(k.toNumber())!==oldPosition)rowTermIsDirty=true;
    if(rowTermIsDirty)updateRowTerm();
    q+=dt*(B*C.pow(getEta())).pow(0.5)*cachedRowTerm;
    currency.value+=dt*theory.publicationMultiplier*getA1(a1.level).pow(1+0.05*a1Exp.level)*powerOfTwo(a2.level)*q;
    theory.invalidateTertiaryEquation();
};
var getInternalState = () => JSON.stringify({version:3,q:q.toString(),k:k.toString()});
var setInternalState = stateString => {
    if(!stateString)return;
    try {
        let state=JSON.parse(stateString);
        q=parseBigNumber(state.q??"1");k=parseBigNumber(state.k??"0");
    } catch(_) {
        let state=stateString.split(" ");
        q=parseBigNumber(state[0]||"1");k=parseBigNumber(state[1]||"0");
    }
    rowTermIsDirty=true;
};
var postPublish = () => {q=BigNumber.ONE;k=BigNumber.ZERO;rowTermIsDirty=true;};
var getPrimaryEquation = () => {
    theory.primaryEquationHeight=85;
    theory.primaryEquationScale=0.85;
    let aPower=a1Exp.level>0?"^{"+(1+0.05*a1Exp.level).toFixed(2)+"}":"";
    let f=fullRow.level>0?"S_0":"\\binom{n}{\\lfloor k\\rfloor}";
    if(variance.level>0)f+="+M_2";
    if(fourthMoment.level>0)f+="+M_4";
    // Publication scaling is supplied by the game and omitted from the UI.
    // Full moment definitions are available in the milestone info panels.
    return "\\begin{aligned}"+
      "\\dot\\rho&=a_1"+aPower+"a_2q\\\\ "+
      "\\dot q&=\\sqrt{BC^{\\eta}}F\\\\ "+
      "F&="+(pascalBoost.level>0?"(n+1)":"")+"\\left("+f+"\\right)"+
      "\\end{aligned}";
};
var getSecondaryEquation = () => {
    theory.secondaryEquationHeight=60;
    theory.secondaryEquationScale=0.8;
    return "\\begin{aligned}\\dot k&=(C/(1+B))^{\\eta}/180\\\\ "+
      "B&=b_1"+(b2Term.level>0?"b_2":"")+",\\quad C=c_1"+(c2Term.level>0?"c_2":"")+"\\end{aligned}";
};
var getTertiaryEquation = () => {
    theory.tertiaryEquationScale=0.8;
    let row=n.level+1,target=Math.floor(row/2),position=Math.min(target,k.toNumber());
    return "q="+q.toString(2)+",\\quad k="+position.toFixed(3)+",\\quad\\eta ="+getEta().toFixed(3);
};
var getPublicationMultiplier = tau => tau.isZero?BigNumber.ONE:tau.pow(PUBLICATION_EXPONENT);
var getPublicationMultiplierFormula = symbol => symbol+"^{0.375}";
var getTau = () => currency.value.pow(TAU_EXPONENT);
var getCurrencyFromTau = tau => [tau.max(BigNumber.ONE).pow(1/TAU_EXPONENT),currency.symbol];
var get2DGraphValue = () => currency.value.sign*(BigNumber.ONE+currency.value.abs()).log10().toNumber();
init();
