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

var makeUpgrade = (index,symbol,base,slope,getValue,free) => {
    let cost = new ExponentialCost(base,slope);
    let upgrade = theory.createUpgrade(index,currency,free ? new FirstFreeCost(cost) : cost);
    upgrade.getDescription = () => Utils.getMath(symbol+"="+getValue(upgrade.level).toString(0));
    upgrade.getInfo = amount => Utils.getMathTo(symbol+"="+getValue(upgrade.level).toString(0),symbol+"="+getValue(upgrade.level+amount).toString(0));
    upgrade.bought = () => {rowTermIsDirty=true;};
    upgrades.push(upgrade);
    return upgrade;
};
var makeMilestone = (index,max,description,info) => {
    let upgrade = theory.createMilestoneUpgrade(index,max);
    upgrade.description=description;
    upgrade.info=info;
    upgrade.boughtOrRefunded=() => {
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
        current.canBeRefunded=() => i===milestoneOrder.length-1||milestoneOrder[i+1].level===0;
    }
};
var init = () => {
    currency=theory.createCurrency();
    a1=makeUpgrade(0,"a_1",10,0.82,getA1,true);
    a2=makeUpgrade(1,"a_2",1e3,9,powerOfTwo,false);
    b1=makeUpgrade(2,"b_1",1e4,0.95,getB1,false);
    b2=makeUpgrade(3,"b_2",1e15,11,powerOfTwo,false);
    c1=makeUpgrade(4,"c_1",50,1.015,getC1,false);
    c2=makeUpgrade(5,"c_2",1e25,10.15,powerOfTwo,false);
    n=makeUpgrade(6,"n",20,N_COST_SLOPE,level=>BigNumber.from(level+1),false);
    theory.createPublicationUpgrade(0,currency,1e8);
    theory.createBuyAllUpgrade(1,currency,1e15);
    theory.createAutoBuyerUpgrade(2,currency,1e25);
    theory.setMilestoneCost(new CustomCost(level=>BigNumber.from(MILESTONE_COSTS[Math.min(level,MILESTONE_COSTS.length-1)])));
    a1Exp=makeMilestone(0,3,"Production exponent","Increase the exponent of a1 by 0.05.");
    b2Term=makeMilestone(1,1,"Unlock b2","Include b2 in B and enable its upgrade.");
    c2Term=makeMilestone(2,1,"Unlock c2","Include c2 in C and enable its upgrade.");
    pascalBoost=makeMilestone(3,1,"Pascal growth","Multiply row production by n+1.");
    cExponent=makeMilestone(4,6,"Concentration exponent","Increase eta by 0.01 in C^eta production and (C/(1+B))^eta progress.");
    fullRow=makeMilestone(5,1,"Symmetric row sum","Replace the current coefficient with the sum of collected coefficients at both ends of the row.");
    refinement=makeMilestone(6,2,"Fourth-moment refinement","Reduce the fourth-moment normalization exponent by 0.1.");
    variance=makeMilestone(7,1,"Second central moment","Add 4 times the second central moment of collected coefficients, divided by n+1.");
    fourthMoment=makeMilestone(8,1,"Fourth central moment","Add 16 times the fourth central moment, divided by (n+1)^2.");
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
    theory.primaryEquationHeight=120;
    return "\\begin{aligned}"+
      "\\dot\\rho&=m a_1^{"+(1+0.05*a1Exp.level).toFixed(2)+"}a_2q\\\\ "+
      "\\dot q&=(BC^{\\eta})^{1/2}F(n,k)\\\\ "+
      "\\dot k&=\\frac{1}{180}\\left(\\frac{C}{1+B}\\right)^{\\eta},\\quad 0\\le k\\le\\lfloor n/2\\rfloor"+
      "\\end{aligned}";
};
var getSecondaryEquation = () => {
    let f=fullRow.level>0?"S_0":"\\binom{n}{\\lfloor k\\rfloor}";
    if(variance.level>0)f+="+\\frac{4S_2}{n+1}";
    if(fourthMoment.level>0)f+="+\\frac{16S_4}{(n+1)^{"+(2-0.1*refinement.level).toFixed(1)+"}}";
    return "\\begin{aligned}B&=b_1"+(b2Term.level>0?"b_2":"")+",\\quad C=c_1"+(c2Term.level>0?"c_2":"")+",\\quad\\eta="+getEta().toFixed(2)+"\\\\ "+
      "F&="+(pascalBoost.level>0?"(n+1)":"")+"\\left("+f+"\\right)\\\\ "+
      "S_r&=\\sum_{j\\in A(k)}(j-n/2)^r\\binom{n}{j},\\quad\\tau=\\rho^{0.4},\\ m=\\tau^{0.375}\\end{aligned}";
};
var getTertiaryEquation = () => {
    let row=n.level+1,target=Math.floor(row/2),position=Math.min(target,k.toNumber());
    let percent=target>0?100*position/target:100;
    let mode=fourthMoment.level>0?"Fourth moment":variance.level>0?"Second moment":fullRow.level>0?"Row sum":"Coefficient";
    return "\\begin{aligned}q&="+q.toString(3)+"\\\\ "+
      "n&="+row+",\\quad k="+position.toFixed(2)+"\\\\ "+
      "\\text{Centre}&="+target+",\\quad\\text{Progress}="+percent.toFixed(1)+"\\%\\\\ "+
      "\\text{Mode}&=\\text{"+mode+"},\\quad\\eta="+getEta().toFixed(2)+"\\end{aligned}";
};
var getPublicationMultiplier = tau => tau.isZero?BigNumber.ONE:tau.pow(PUBLICATION_EXPONENT);
var getPublicationMultiplierFormula = symbol => symbol+"^{0.375}";
var getTau = () => currency.value.pow(TAU_EXPONENT);
var getCurrencyFromTau = tau => [tau.max(BigNumber.ONE).pow(1/TAU_EXPONENT),currency.symbol];
var get2DGraphValue = () => currency.value.sign*(BigNumber.ONE+currency.value.abs()).log10().toNumber();
init();
