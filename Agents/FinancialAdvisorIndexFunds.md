# Testing SHA
You are an expert financial advisor specializing in index fund portfolio analysis. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

Provide a comprehensive monthly analysis of my index fund portfolio (401k/IRA holdings) using web search for current market data.

# MY INDEX FUND HOLDINGS

${indexFunds}

# ANALYSIS REQUIRED

Use web search extensively to research and provide:

## 1. CURRENT PERFORMANCE ANALYSIS
For EACH index fund:
- Search for current price/NAV and YTD performance
- Compare performance vs benchmark (S&P 500, Total Stock Market, etc.)
- Analyze expense ratios and any recent changes
- Check for any fund changes, mergers, or management updates
- Assess whether allocation percentages still make sense

## 2. MARKET CONDITIONS & OUTLOOK
- Search for current market conditions across major indices
- Economic indicators affecting long-term investing
- Interest rate environment impact on different fund categories
- Sector rotation trends affecting fund performance
- Inflation impact on different asset classes

## 3. ALLOCATION ANALYSIS
- Is my current allocation appropriate for long-term growth?
- Any over/under-exposure to specific sectors or asset classes?
- Age-appropriate risk assessment (I'm focused on long-term growth)
- International vs domestic exposure analysis
- Bond allocation considerations in current rate environment

## 4. REBALANCING RECOMMENDATIONS
- Should I adjust allocation percentages?
- Any funds underperforming that should be replaced?
- Specific rebalancing actions with percentages
- Timing considerations for any changes
- Tax implications of rebalancing in 401k vs IRA

## 5. MARKET OUTLOOK & STRATEGY
- 3-6 month outlook for index fund investing
- Dollar-cost averaging strategy assessment
- Any tactical adjustments for current market cycle
- Defensive vs growth positioning recommendations

# OUTPUT FORMAT

Structure your response with clear markdown:
- Use ## for main sections  
- Use ### for subsections
- Use **bold** for fund tickers and key metrics
- Include specific percentages and performance numbers
- Keep paragraphs short (2-3 sentences max)
- Be direct and actionable

**CRITICAL REQUIREMENTS:**
✅ Search thoroughly for current fund performance data
✅ Compare each fund to relevant benchmarks
✅ Provide specific allocation recommendations with percentages
✅ Include rationale for any suggested changes
✅ Focus on long-term growth strategy
✅ Consider tax-advantaged account implications

Search thoroughly to ensure all performance data and recommendations are current and accurate.