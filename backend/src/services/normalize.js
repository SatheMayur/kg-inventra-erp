// Indian grocery item normalizer + hierarchical classifier.
// Hierarchy: Category > Sub-Category > Item (canonical) > Form > Variant > Grade > Quantity/Unit.

const CANONICAL = {
  // ===== Vegetables =====
  'Potato':            ['aloo', 'alu', 'aaloo', 'aalu', 'potato', 'poteto', 'patato'],
  'Onion':             ['onion', 'pyaaz', 'pyaz', 'pyaj', 'kaanda', 'kanda'],
  'Tomato':            ['tomato', 'tamatar', 'tameta', 'tamata', 'tomatoe'],
  'Spinach':           ['spinach', 'palak', 'paalak', 'palak sabzi', 'palak saag'],
  'Ladyfinger':        ['ladyfinger', "lady's finger", 'ladies finger', 'lady finger', 'bhindi', 'bhindi sabzi', 'okra'],
  'Brinjal':           ['brinjal', 'baingan', 'began', 'eggplant', 'aubergine'],
  'Bottle Gourd':      ['bottle gourd', 'lauki', 'dudhi', 'doodhi', 'ghiya', 'calabash'],
  'Bitter Gourd':      ['bitter gourd', 'karela', 'bitter melon'],
  'Ridge Gourd':       ['ridge gourd', 'turai', 'turia', 'toree', 'ridi gourd'],
  'Ash Gourd':         ['ash gourd', 'safed petha', 'white pumpkin', 'winter melon'],
  'Pumpkin':           ['pumpkin', 'kaddu', 'kaddu pumpkin', 'sitafal'],
  'Carrot':            ['carrot', 'gajar', 'gaajar'],
  'Beetroot':          ['beetroot', 'beet', 'chukandar', 'chakundar'],
  'Cauliflower':       ['cauliflower', 'phool gobhi', 'phool gobi', 'phoolgobhi', 'gobhi'],
  'Cabbage':           ['cabbage', 'patta gobhi', 'patta gobi', 'pattagobhi', 'bandh gobhi'],
  'Capsicum':          ['capsicum', 'shimla mirch', 'shimla mirchi', 'bell pepper'],
  'Cucumber':          ['cucumber', 'kheera', 'khira', 'kakdi', 'kakdee', 'kakri'],
  'Radish':            ['radish', 'mooli', 'muli'],
  'Turnip':            ['turnip', 'shalgam', 'shaljam'],
  'Sweet Potato':      ['sweet potato', 'shakarkandi', 'shakarkand', 'ratalu'],
  'Drumstick':         ['drumstick', 'sahjan', 'sahjan ki phali', 'munga'],
  'Green Chilies':     ['green chili', 'green chilies', 'green chillies', 'hari mirch', 'hari mirchi'],
  'Ginger':            ['ginger', 'adarak', 'adrak'],
  'Garlic':            ['garlic', 'lahsun', 'lasun', 'lehsun'],
  'Coriander Leaves':  ['coriander', 'coriander leaves', 'cilantro', 'dhaniya', 'dhania', 'dhaniya patte', 'kothmir', 'kothimbir'],
  'Mint Leaves':       ['mint', 'mint leaves', 'pudina', 'pudina patte'],
  'Fenugreek Leaves':  ['fenugreek leaves', 'methi', 'methi patte', 'methi leaves'],
  'Amaranth Leaves':   ['amaranth leaves', 'chaulai', 'laal maath', 'lal math'],
  'Cluster Beans':     ['cluster beans', 'gawar', 'gawar phali', 'guar'],
  'Ivy Gourd':         ['ivy gourd', 'kundru', 'tindora'],
  'Taro':              ['taro', 'arbi', 'arvi', 'colocasia'],
  'Mushrooms':         ['mushroom', 'mushrooms', 'khumb', 'khumbhi'],
  'Peas':              ['peas', 'green peas', 'matar', 'mutter'],
  'French Beans':      ['french beans', 'fansi', 'sem ki phali', 'string beans'],
  'Spring Onion':      ['spring onion', 'scallion', 'green onion', 'hara pyaaz', 'hara pyaz'],

  // ===== Fruits =====
  'Apple':             ['apple', 'apples', 'seb', 'sev'],
  'Banana':            ['banana', 'bananas', 'kela', 'kele'],
  'Mango':             ['mango', 'mangoes', 'aam'],
  'Orange':            ['orange', 'oranges', 'santra', 'santara'],
  'Sweet Lime':        ['sweet lime', 'mosambi', 'mosumbi'],
  'Pomegranate':       ['pomegranate', 'anar', 'anaar'],
  'Grapes':            ['grape', 'grapes', 'angoor', 'angur'],
  'Watermelon':        ['watermelon', 'tarbooz', 'tarbuj', 'tarbuz'],
  'Muskmelon':         ['muskmelon', 'kharbuja', 'kharbooja'],
  'Papaya':            ['papaya', 'papita', 'papeeta'],
  'Pineapple':         ['pineapple', 'ananas'],
  'Guava':             ['guava', 'amrood', 'amrud', 'peru'],
  'Pear':              ['pear', 'pears', 'nashpati'],
  'Strawberry':        ['strawberry', 'strawberries'],
  'Lemon':             ['lemon', 'nimbu', 'lime', 'nimboo'],

  // ===== Pulses & Lentils =====
  'Toor Dal':          ['toor dal', 'tur dal', 'arhar dal', 'toor', 'arhar'],
  'Moong Dal':         ['moong dal', 'green moong', 'split moong', 'mung dal'],
  'Masoor Dal':        ['masoor dal', 'red lentil', 'red lentils', 'masoor'],
  'Chana Dal':         ['chana dal', 'split chickpea', 'channa dal'],
  'Urad Dal':          ['urad dal', 'urad', 'split urad'],
  'Rajma':             ['rajma', 'kidney beans', 'red kidney beans'],
  'Chole':             ['chole', 'kabuli chana', 'chickpeas', 'white chickpeas', 'garbanzo'],
  'Black Gram Whole':  ['sabut urad', 'urad whole', 'whole urad', 'black gram whole', 'black gram'],
  'Whole Moong':       ['sabut moong', 'whole moong', 'whole green moong', 'green gram'],

  // ===== Grains & Flours =====
  'Wheat Flour':       ['wheat flour', 'atta', 'whole wheat flour', 'indian atta', 'gehu atta'],
  'Rice':              ['rice', 'chawal', 'chaval', 'indian rice'],
  'Basmati Rice':      ['basmati', 'basmati rice'],
  'Besan':             ['besan', 'gram flour', 'chickpea flour'],
  'Rice Flour':        ['rice flour', 'chawal ka atta', 'chawal atta'],
  'Bajra':             ['bajra', 'pearl millet'],
  'Jowar':             ['jowar', 'sorghum'],
  'Ragi':              ['ragi', 'finger millet', 'nachni'],
  'Suji':              ['suji', 'sooji', 'semolina', 'rava'],
  'Maida':             ['maida', 'refined flour', 'all purpose flour'],
  'Poha':              ['poha', 'flattened rice', 'beaten rice'],

  // ===== Spices & Condiments =====
  'Turmeric Powder':   ['turmeric', 'turmeric powder', 'haldi', 'haldi powder'],
  'Red Chili Powder':  ['red chili powder', 'red chilli powder', 'mirchi powder', 'lal mirch powder', 'lal mirch'],
  'Coriander Powder':  ['coriander powder', 'dhaniya powder', 'dhania powder'],
  'Garam Masala':      ['garam masala'],
  'Cumin Seeds':       ['cumin', 'cumin seeds', 'jeera', 'zeera'],
  'Mustard Seeds':     ['mustard seeds', 'rai', 'sarson', 'sarso'],
  'Asafoetida':        ['asafoetida', 'hing'],
  'Curry Leaves':      ['curry leaves', 'curry leaf', 'kadi patta', 'kari patta', 'meetha neem'],
  'Tamarind':          ['tamarind', 'imli'],

  // ===== Dairy =====
  'Paneer':            ['paneer', 'indian cottage cheese', 'cottage cheese'],
  'Curd':              ['curd', 'dahi', 'yogurt', 'yoghurt', 'indian curd'],
  'Ghee':              ['ghee', 'clarified butter'],
  'Butter':            ['butter', 'makkhan', 'makhan'],
  'Milk':              ['milk', 'doodh', 'dudh'],
  'Cheese':            ['cheese'],
  'Cream':             ['cream', 'malai'],
  'Buttermilk':        ['buttermilk', 'chaas', 'chaach'],

  // ===== Oils & Fats =====
  'Mustard Oil':       ['mustard oil', 'sarson ka tel', 'sarso ka tel'],
  'Sunflower Oil':     ['sunflower oil', 'sundflower oil'],
  'Vegetable Oil':     ['vegetable oil', 'cooking oil', 'veg oil'],
  'Groundnut Oil':     ['groundnut oil', 'peanut oil', 'moongphali ka tel'],
  'Coconut Oil':       ['coconut oil', 'nariyal tel'],
  'Olive Oil':         ['olive oil'],
  'Rice Bran Oil':     ['rice bran oil'],
  'Sesame Oil':        ['sesame oil', 'til oil', 'til ka tel', 'gingelly oil'],

  // ===== Dry Fruits & Nuts =====
  'Almonds':           ['almond', 'almonds', 'badam', 'baadam'],
  'Cashews':           ['cashew', 'cashews', 'cashew nut', 'cashew nuts', 'kaju'],
  'Walnuts':           ['walnut', 'walnuts', 'akhrot', 'akrot'],
  'Pistachios':        ['pista', 'pistachio', 'pistachios', 'pistah'],
  'Pecans':            ['pecan', 'pecans'],
  'Macadamia Nuts':    ['macadamia', 'macadamia nut', 'macadamia nuts'],
  'Peanuts':           ['peanut', 'peanuts', 'moongphali', 'mungphali', 'groundnut', 'groundnuts'],
  'Raisins':           ['raisin', 'raisins', 'kishmish', 'kismis', 'kishmis'],
  'Dates':             ['date', 'dates', 'khajoor', 'khajur', 'khazoor'],
  'Apricots':          ['apricot', 'apricots', 'khubani', 'khobani', 'dried apricot', 'dried apricots'],
  'Figs':              ['fig', 'figs', 'anjeer', 'anjir', 'dried fig', 'dried figs'],
  'Foxnuts':           ['foxnut', 'foxnuts', 'makhana', 'phool makhana'],

  // ===== Sweeteners & Salt =====
  'Sugar':             ['sugar', 'cheeni', 'chini', 'shakkar'],
  'Jaggery':           ['jaggery', 'gud', 'gur'],
  'Honey':             ['honey', 'shahad', 'madhu'],
  'Khandsari':         ['khandsari'],
  'Brown Sugar':       ['brown sugar'],
  'Salt':              ['salt', 'namak'],
  'Rock Salt':         ['rock salt', 'sendha namak', 'sendha'],
  'Black Salt':        ['black salt', 'kala namak'],

  // ===== Bakery & Snacks =====
  'Bread':             ['bread', 'pao', 'pav', 'white bread'],
  'Brown Bread':       ['brown bread', 'whole wheat bread', 'wheat bread'],
  'Bun':               ['bun', 'buns'],
  'Biscuits':          ['biscuit', 'biscuits', 'cookie', 'cookies'],
  'Rusk':              ['rusk', 'toast'],
  'Namkeen':           ['namkeen', 'mixture', 'farsan'],
  'Chips':             ['chips', 'potato chips', 'wafers'],

  // ===== Ready-to-Eat & Packaged Food =====
  'Instant Noodles':   ['maggi', 'instant noodles', 'noodles'],
  'Pasta':             ['pasta', 'macaroni', 'spaghetti'],
  'Instant Soup':      ['instant soup', 'soup mix', 'soup'],
  'Ready Meal':        ['ready meal', 'rte meal', 'mtr', 'haldirams meal'],
  'Vermicelli':        ['vermicelli', 'seviyan', 'sevai'],

  // ===== Beverages =====
  'Tea':               ['tea', 'chai', 'chai patti', 'tea powder', 'tea leaves'],
  'Green Tea':         ['green tea'],
  'Coffee':            ['coffee', 'coffee powder'],
  'Fruit Juice':       ['fruit juice', 'juice'],
  'Cold Drink':        ['cold drink', 'soft drink', 'cola', 'soda'],
  'Lemonade':          ['lemonade', 'nimbu pani', 'shikanji'],
  'Energy Drink':      ['energy drink'],
  'Water':             ['water', 'mineral water', 'pani'],

  // ===== Confectionery =====
  'Chocolate':         ['chocolate', 'chocolates', 'choco'],
  'Dark Chocolate':    ['dark chocolate'],
  'Candy':             ['candy', 'candies', 'sweets'],
  'Toffee':            ['toffee', 'toffees'],
  'Mints':             ['mints', 'mint candy'],
  'Gum':               ['gum', 'chewing gum', 'bubble gum'],

  // ===== Eggs =====
  'Eggs':              ['egg', 'eggs', 'anda', 'ande'],
};

// Canonical -> {category, sub_category}.
const TAXONOMY = {
  // Vegetables
  'Potato':            { category: 'Vegetables', sub_category: 'Root Vegetables' },
  'Carrot':            { category: 'Vegetables', sub_category: 'Root Vegetables' },
  'Beetroot':          { category: 'Vegetables', sub_category: 'Root Vegetables' },
  'Radish':            { category: 'Vegetables', sub_category: 'Root Vegetables' },
  'Turnip':            { category: 'Vegetables', sub_category: 'Root Vegetables' },
  'Sweet Potato':      { category: 'Vegetables', sub_category: 'Root Vegetables' },
  'Taro':              { category: 'Vegetables', sub_category: 'Root Vegetables' },
  'Ginger':            { category: 'Vegetables', sub_category: 'Root Vegetables' },

  'Onion':             { category: 'Vegetables', sub_category: 'Bulb Vegetables' },
  'Garlic':            { category: 'Vegetables', sub_category: 'Bulb Vegetables' },
  'Spring Onion':      { category: 'Vegetables', sub_category: 'Bulb Vegetables' },

  'Spinach':           { category: 'Vegetables', sub_category: 'Leafy Vegetables' },
  'Coriander Leaves':  { category: 'Vegetables', sub_category: 'Leafy Vegetables' },
  'Mint Leaves':       { category: 'Vegetables', sub_category: 'Leafy Vegetables' },
  'Fenugreek Leaves':  { category: 'Vegetables', sub_category: 'Leafy Vegetables' },
  'Amaranth Leaves':   { category: 'Vegetables', sub_category: 'Leafy Vegetables' },
  'Cabbage':           { category: 'Vegetables', sub_category: 'Leafy Vegetables' },

  'Bottle Gourd':      { category: 'Vegetables', sub_category: 'Gourd Vegetables' },
  'Bitter Gourd':      { category: 'Vegetables', sub_category: 'Gourd Vegetables' },
  'Ridge Gourd':       { category: 'Vegetables', sub_category: 'Gourd Vegetables' },
  'Ash Gourd':         { category: 'Vegetables', sub_category: 'Gourd Vegetables' },
  'Pumpkin':           { category: 'Vegetables', sub_category: 'Gourd Vegetables' },
  'Ivy Gourd':         { category: 'Vegetables', sub_category: 'Gourd Vegetables' },
  'Cucumber':          { category: 'Vegetables', sub_category: 'Gourd Vegetables' },

  'Tomato':            { category: 'Vegetables', sub_category: 'Fruit Vegetables' },
  'Brinjal':           { category: 'Vegetables', sub_category: 'Fruit Vegetables' },
  'Capsicum':          { category: 'Vegetables', sub_category: 'Fruit Vegetables' },
  'Ladyfinger':        { category: 'Vegetables', sub_category: 'Fruit Vegetables' },
  'Green Chilies':     { category: 'Vegetables', sub_category: 'Fruit Vegetables' },
  'Drumstick':         { category: 'Vegetables', sub_category: 'Fruit Vegetables' },

  'Cluster Beans':     { category: 'Vegetables', sub_category: 'Pod & Bean Vegetables' },
  'French Beans':      { category: 'Vegetables', sub_category: 'Pod & Bean Vegetables' },
  'Peas':              { category: 'Vegetables', sub_category: 'Pod & Bean Vegetables' },

  'Cauliflower':       { category: 'Vegetables', sub_category: 'Stem & Flower Vegetables' },
  'Mushrooms':         { category: 'Vegetables', sub_category: 'Tuber & Other Vegetables' },

  // Fruits
  'Lemon':             { category: 'Fruits', sub_category: 'Citrus Fruits' },
  'Orange':            { category: 'Fruits', sub_category: 'Citrus Fruits' },
  'Sweet Lime':        { category: 'Fruits', sub_category: 'Citrus Fruits' },
  'Banana':            { category: 'Fruits', sub_category: 'Tropical Fruits' },
  'Mango':             { category: 'Fruits', sub_category: 'Tropical Fruits' },
  'Pineapple':         { category: 'Fruits', sub_category: 'Tropical Fruits' },
  'Papaya':            { category: 'Fruits', sub_category: 'Tropical Fruits' },
  'Guava':             { category: 'Fruits', sub_category: 'Tropical Fruits' },
  'Apple':             { category: 'Fruits', sub_category: 'Pome & Stone Fruits' },
  'Pear':              { category: 'Fruits', sub_category: 'Pome & Stone Fruits' },
  'Grapes':            { category: 'Fruits', sub_category: 'Berries & Grapes' },
  'Strawberry':        { category: 'Fruits', sub_category: 'Berries & Grapes' },
  'Pomegranate':       { category: 'Fruits', sub_category: 'Berries & Grapes' },
  'Watermelon':        { category: 'Fruits', sub_category: 'Melons' },
  'Muskmelon':         { category: 'Fruits', sub_category: 'Melons' },

  // Pulses & Lentils
  'Toor Dal':          { category: 'Pulses & Lentils', sub_category: 'Split Dals' },
  'Moong Dal':         { category: 'Pulses & Lentils', sub_category: 'Split Dals' },
  'Masoor Dal':        { category: 'Pulses & Lentils', sub_category: 'Split Dals' },
  'Chana Dal':         { category: 'Pulses & Lentils', sub_category: 'Split Dals' },
  'Urad Dal':          { category: 'Pulses & Lentils', sub_category: 'Split Dals' },
  'Rajma':             { category: 'Pulses & Lentils', sub_category: 'Whole Pulses' },
  'Chole':             { category: 'Pulses & Lentils', sub_category: 'Whole Pulses' },
  'Black Gram Whole':  { category: 'Pulses & Lentils', sub_category: 'Whole Pulses' },
  'Whole Moong':       { category: 'Pulses & Lentils', sub_category: 'Whole Pulses' },

  // Grains & Flours
  'Rice':              { category: 'Grains & Flours', sub_category: 'Rice' },
  'Basmati Rice':      { category: 'Grains & Flours', sub_category: 'Rice' },
  'Poha':              { category: 'Grains & Flours', sub_category: 'Rice' },
  'Wheat Flour':       { category: 'Grains & Flours', sub_category: 'Wheat & Atta' },
  'Maida':             { category: 'Grains & Flours', sub_category: 'Wheat & Atta' },
  'Suji':              { category: 'Grains & Flours', sub_category: 'Wheat & Atta' },
  'Besan':             { category: 'Grains & Flours', sub_category: 'Flours' },
  'Rice Flour':        { category: 'Grains & Flours', sub_category: 'Flours' },
  'Bajra':             { category: 'Grains & Flours', sub_category: 'Other Grains' },
  'Jowar':             { category: 'Grains & Flours', sub_category: 'Other Grains' },
  'Ragi':              { category: 'Grains & Flours', sub_category: 'Other Grains' },

  // Spices & Condiments
  'Cumin Seeds':       { category: 'Spices & Condiments', sub_category: 'Whole Spices' },
  'Mustard Seeds':     { category: 'Spices & Condiments', sub_category: 'Whole Spices' },
  'Asafoetida':        { category: 'Spices & Condiments', sub_category: 'Whole Spices' },
  'Tamarind':          { category: 'Spices & Condiments', sub_category: 'Whole Spices' },
  'Turmeric Powder':   { category: 'Spices & Condiments', sub_category: 'Powdered Spices' },
  'Red Chili Powder':  { category: 'Spices & Condiments', sub_category: 'Powdered Spices' },
  'Coriander Powder':  { category: 'Spices & Condiments', sub_category: 'Powdered Spices' },
  'Curry Leaves':      { category: 'Spices & Condiments', sub_category: 'Herbs & Leaves' },
  'Garam Masala':      { category: 'Spices & Condiments', sub_category: 'Spice Blends' },

  // Dairy
  'Milk':              { category: 'Dairy', sub_category: 'Liquid Dairy' },
  'Buttermilk':        { category: 'Dairy', sub_category: 'Liquid Dairy' },
  'Cream':             { category: 'Dairy', sub_category: 'Liquid Dairy' },
  'Curd':              { category: 'Dairy', sub_category: 'Fermented' },
  'Paneer':            { category: 'Dairy', sub_category: 'Cheese' },
  'Cheese':            { category: 'Dairy', sub_category: 'Cheese' },
  'Ghee':              { category: 'Dairy', sub_category: 'Fats' },
  'Butter':            { category: 'Dairy', sub_category: 'Fats' },

  // Oils & Fats
  'Mustard Oil':       { category: 'Oils & Fats', sub_category: 'Cooking Oils' },
  'Sunflower Oil':     { category: 'Oils & Fats', sub_category: 'Cooking Oils' },
  'Vegetable Oil':     { category: 'Oils & Fats', sub_category: 'Cooking Oils' },
  'Groundnut Oil':     { category: 'Oils & Fats', sub_category: 'Cooking Oils' },
  'Coconut Oil':       { category: 'Oils & Fats', sub_category: 'Cooking Oils' },
  'Olive Oil':         { category: 'Oils & Fats', sub_category: 'Cooking Oils' },
  'Rice Bran Oil':     { category: 'Oils & Fats', sub_category: 'Cooking Oils' },
  'Sesame Oil':        { category: 'Oils & Fats', sub_category: 'Cooking Oils' },

  // Dry Fruits & Nuts
  'Almonds':           { category: 'Dry Fruits & Nuts', sub_category: 'Nuts' },
  'Cashews':           { category: 'Dry Fruits & Nuts', sub_category: 'Nuts' },
  'Walnuts':           { category: 'Dry Fruits & Nuts', sub_category: 'Nuts' },
  'Pistachios':        { category: 'Dry Fruits & Nuts', sub_category: 'Nuts' },
  'Pecans':            { category: 'Dry Fruits & Nuts', sub_category: 'Nuts' },
  'Macadamia Nuts':    { category: 'Dry Fruits & Nuts', sub_category: 'Nuts' },
  'Peanuts':           { category: 'Dry Fruits & Nuts', sub_category: 'Nuts' },
  'Foxnuts':           { category: 'Dry Fruits & Nuts', sub_category: 'Nuts' },
  'Raisins':           { category: 'Dry Fruits & Nuts', sub_category: 'Dry Fruits' },
  'Dates':             { category: 'Dry Fruits & Nuts', sub_category: 'Dry Fruits' },
  'Apricots':          { category: 'Dry Fruits & Nuts', sub_category: 'Dry Fruits' },
  'Figs':              { category: 'Dry Fruits & Nuts', sub_category: 'Dry Fruits' },

  // Sweeteners & Salt
  'Sugar':             { category: 'Sweeteners & Salt', sub_category: 'Sweeteners' },
  'Brown Sugar':       { category: 'Sweeteners & Salt', sub_category: 'Sweeteners' },
  'Khandsari':         { category: 'Sweeteners & Salt', sub_category: 'Sweeteners' },
  'Jaggery':           { category: 'Sweeteners & Salt', sub_category: 'Sweeteners' },
  'Honey':             { category: 'Sweeteners & Salt', sub_category: 'Sweeteners' },
  'Salt':              { category: 'Sweeteners & Salt', sub_category: 'Salt' },
  'Rock Salt':         { category: 'Sweeteners & Salt', sub_category: 'Salt' },
  'Black Salt':        { category: 'Sweeteners & Salt', sub_category: 'Salt' },

  // Bakery & Snacks
  'Bread':             { category: 'Bakery & Snacks', sub_category: 'Bread & Buns' },
  'Brown Bread':       { category: 'Bakery & Snacks', sub_category: 'Bread & Buns' },
  'Bun':               { category: 'Bakery & Snacks', sub_category: 'Bread & Buns' },
  'Biscuits':          { category: 'Bakery & Snacks', sub_category: 'Biscuits & Cookies' },
  'Rusk':              { category: 'Bakery & Snacks', sub_category: 'Biscuits & Cookies' },
  'Namkeen':           { category: 'Bakery & Snacks', sub_category: 'Snacks' },
  'Chips':             { category: 'Bakery & Snacks', sub_category: 'Snacks' },

  // Ready-to-Eat & Packaged Food
  'Instant Noodles':   { category: 'Ready-to-Eat & Packaged Food', sub_category: 'Instant Food' },
  'Pasta':             { category: 'Ready-to-Eat & Packaged Food', sub_category: 'Instant Food' },
  'Instant Soup':      { category: 'Ready-to-Eat & Packaged Food', sub_category: 'Instant Food' },
  'Vermicelli':        { category: 'Ready-to-Eat & Packaged Food', sub_category: 'Instant Food' },
  'Ready Meal':        { category: 'Ready-to-Eat & Packaged Food', sub_category: 'Ready Meals' },

  // Beverages
  'Tea':               { category: 'Beverages', sub_category: 'Tea & Coffee' },
  'Green Tea':         { category: 'Beverages', sub_category: 'Tea & Coffee' },
  'Coffee':            { category: 'Beverages', sub_category: 'Tea & Coffee' },
  'Fruit Juice':       { category: 'Beverages', sub_category: 'Juices' },
  'Lemonade':          { category: 'Beverages', sub_category: 'Juices' },
  'Cold Drink':        { category: 'Beverages', sub_category: 'Soft Drinks' },
  'Energy Drink':      { category: 'Beverages', sub_category: 'Soft Drinks' },
  'Water':             { category: 'Beverages', sub_category: 'Water' },

  // Confectionery
  'Chocolate':         { category: 'Confectionery', sub_category: 'Chocolate' },
  'Dark Chocolate':    { category: 'Confectionery', sub_category: 'Chocolate' },
  'Candy':             { category: 'Confectionery', sub_category: 'Candy' },
  'Toffee':            { category: 'Confectionery', sub_category: 'Candy' },
  'Mints':             { category: 'Confectionery', sub_category: 'Candy' },
  'Gum':               { category: 'Confectionery', sub_category: 'Candy' },

  // Eggs
  'Eggs':              { category: 'Eggs', sub_category: 'Eggs' },
};

// Categories that use packaged-grade scale (Premium/Standard/Economy).
const PACKAGED_CATEGORIES = new Set([
  'Pulses & Lentils', 'Grains & Flours', 'Spices & Condiments', 'Dairy',
  'Oils & Fats', 'Dry Fruits & Nuts', 'Sweeteners & Salt', 'Bakery & Snacks',
  'Ready-to-Eat & Packaged Food', 'Beverages', 'Confectionery', 'Eggs',
]);
// Categories that use fresh-grade scale (Extra Class/Class I/Class II).
const FRESH_CATEGORIES = new Set(['Vegetables', 'Fruits']);

// Grade hints (raw token -> {type, value}).
const GRADE_HINTS = {
  'premium':     { type: 'packaged', value: 'Premium' },
  'supreme':     { type: 'packaged', value: 'Premium' },
  'fancy':       { type: 'packaged', value: 'Premium' },
  'select':      { type: 'packaged', value: 'Premium' },
  'best':        { type: 'packaged', value: 'Premium' },
  'top':         { type: 'packaged', value: 'Premium' },
  'standard':    { type: 'packaged', value: 'Standard' },
  'regular':     { type: 'packaged', value: 'Standard' },
  'normal':      { type: 'packaged', value: 'Standard' },
  'medium':      { type: 'packaged', value: 'Standard' },
  'economy':     { type: 'packaged', value: 'Economy' },
  'cheap':       { type: 'packaged', value: 'Economy' },
  'basic':       { type: 'packaged', value: 'Economy' },
  'budget':      { type: 'packaged', value: 'Economy' },
  'value':       { type: 'packaged', value: 'Economy' },
  'low':         { type: 'packaged', value: 'Economy' },

  'extra':       { type: 'fresh', value: 'Extra Class' },
  'extra class': { type: 'fresh', value: 'Extra Class' },
  'class i':     { type: 'fresh', value: 'Class I' },
  'class 1':     { type: 'fresh', value: 'Class I' },
  'class one':   { type: 'fresh', value: 'Class I' },
  'class ii':    { type: 'fresh', value: 'Class II' },
  'class 2':     { type: 'fresh', value: 'Class II' },
  'class two':   { type: 'fresh', value: 'Class II' },
  'a grade':     { type: 'fresh', value: 'Extra Class' },
  'b grade':     { type: 'fresh', value: 'Class I' },
  'c grade':     { type: 'fresh', value: 'Class II' },

  // Cashew score grades — applied as Variant W-code AND grade.
  'w180':        { type: 'cashew', value: 'W180' },
  'w240':        { type: 'cashew', value: 'W240' },
  'w320':        { type: 'cashew', value: 'W320' },
  'w450':        { type: 'cashew', value: 'W450' },
};

const SIZE_HINTS = {
  'large':    'Large',
  'big':      'Large',
  'bada':     'Large',
  'jumbo':    'Large',
  'xl':       'Large',
  'med':      'Medium',
  'small':    'Small',
  'chhota':   'Small',
  'mini':     'Small',
};
const SIZE_TO_FRESH_GRADE = {
  'Large':  'Extra Class',
  'Medium': 'Class I',
  'Small':  'Class II',
};

// Form hints — physical/preparation state. Wins over variant when same token appears.
const FORM_TOKENS = new Map(Object.entries({
  'whole':           'Whole',
  'sabut':           'Whole',
  'split':           'Split',
  'pieces':          'Pieces & Cuts',
  'cuts':            'Pieces & Cuts',
  'pieces & cuts':   'Pieces & Cuts',
  'powder':          'Powder',
  'powdered':        'Powder',
  'ground':          'Powder',
  'with skin':       'With Skin',
  'peeled':          'Peeled',
  'slivered':        'Slivered',
  'flakes':          'Flakes',
  'raw':             'Raw',
  'parboiled':       'Parboiled',
  'sella':           'Sella',
  'brown':           'Brown',
  'grated':          'Grated',
  'chips':           'Chips',
  'halves':          'Halves',
  'broken':          'Broken',
  'roasted':         'Roasted',
  'salted':          'Salted',
  'unsalted':        'Unsalted',
  'shelled':         'Shelled',
  'unshelled':       'Unshelled',
  'open shell':      'Open-Shell',
  'open-shell':      'Open-Shell',
  'dhuli':           'Washed',
  'washed':          'Washed',
  'polished':        'Polished',
  'unpolished':      'Unpolished',
}));

// Variant hints — origin/brand/variety/color/special processing.
const VARIANT_TOKENS = new Map(Object.entries({
  // Colors
  'red':           'Red',
  'lal':           'Red',
  'laal':          'Red',
  'white':         'White',
  'safed':         'White',
  'green':         'Green',
  'hara':          'Green',
  'hari':          'Green',
  'yellow':        'Yellow',
  'peela':         'Yellow',
  'purple':        'Purple',
  'baingani':      'Purple',
  'black':         'Black',
  'kala':          'Black',
  'kaala':         'Black',

  // Regions / origin
  'kashmiri':      'Kashmiri',
  'kashmir':       'Kashmiri',
  'rajasthani':    'Rajasthani',
  'guntur':        'Guntur',
  'byadgi':        'Byadgi',
  'malabar':       'Malabar',
  'nashik':        'Nashik',
  'ooty':          'Ooty',
  'shimla':        'Shimla',
  'nagpur':        'Nagpur',
  'kufri':         'Kufri',
  'kufri jyoti':   'Kufri Jyoti',
  'jyoti':         'Kufri Jyoti',
  'california':    'California',
  'californian':   'California',
  'mysore':        'Mysore',
  'himalayan':     'Himalayan',
  'iranian':       'Iranian',
  'iran':          'Iranian',
  'saudi':         'Saudi',
  'afghani':       'Afghani',
  'afghan':        'Afghani',
  'indian':        'Indian',
  'african':       'African',

  // Rice subtypes
  'sona masoori':  'Sona Masoori',
  'sona':          'Sona Masoori',
  'ponni':         'Ponni',
  'mogra':         'Mogra',
  'dehradun':      'Dehradun',
  'pusa':          'Pusa',
  '1121':          '1121',

  // Wheat varieties
  'sharbati':      'Sharbati',
  'lokwan':        'Lokwan',
  'mp sharbati':   'MP Sharbati',

  // Date varieties
  'medjool':       'Medjool',
  'deglet noor':   'Deglet Noor',
  'deglet':        'Deglet Noor',

  // Cashew score (also acts as grade)
  'w180':          'W180',
  'w240':          'W240',
  'w320':          'W320',
  'w450':          'W450',

  // Oil / dairy / atta specials
  'kachi ghani':   'Kachi Ghani',
  'kacchi ghani':  'Kachi Ghani',
  'cold pressed':  'Cold-Pressed',
  'cold-pressed':  'Cold-Pressed',
  'refined':       'Refined',
  'filtered':      'Filtered',
  'extra virgin':  'Extra Virgin',
  'toned':         'Toned',
  'double toned':  'Double Toned',
  'full cream':    'Full Cream',
  'skimmed':       'Skimmed',
  'low fat':       'Low Fat',
  'a2':            'A2',
  'desi':          'Desi',
  'multigrain':    'Multigrain',
  'chakki':        'Chakki Fresh',
  'chakki fresh':  'Chakki Fresh',
  'organic':       'Organic',
  'seedless':      'Seedless',
  'soft':          'Soft',
  'semi dry':      'Semi-Dry',
  'semi-dry':      'Semi-Dry',

  // Brands
  'india gate':    'India Gate',
  'daawat':        'Daawat',
  'mdh':           'MDH',
  'everest':       'Everest',
  'tata':          'Tata',
  'amul':          'Amul',
  'mother dairy':  'Mother Dairy',
  'maggi':         'Maggi',
  'haldirams':     "Haldiram's",
  'parle':         'Parle',
  'britannia':     'Britannia',
}));

// Multi-word hints — must be probed before single-word loop.
const MULTI_WORD_FORMS    = [...FORM_TOKENS.keys()].filter(k => k.includes(' '));
const MULTI_WORD_VARIANTS = [...VARIANT_TOKENS.keys()].filter(k => k.includes(' '));
const MULTI_WORD_GRADES   = Object.keys(GRADE_HINTS).filter(k => k.includes(' '));

// Alias -> canonical reverse index. Built lazily; custom items are merged via reloadCustomItems().
const ALIAS_INDEX = new Map();
const CUSTOM_TAXONOMY = new Map();   // canonical -> { category, sub_category }
const CUSTOM_ALIASES  = new Map();   // canonical -> [aliases]

function rebuildAliasIndex() {
  ALIAS_INDEX.clear();
  for (const [canonical, aliases] of Object.entries(CANONICAL)) {
    ALIAS_INDEX.set(normalizeKey(canonical), canonical);
    for (const a of aliases) ALIAS_INDEX.set(normalizeKey(a), canonical);
  }
  for (const [canonical, aliases] of CUSTOM_ALIASES) {
    ALIAS_INDEX.set(normalizeKey(canonical), canonical);
    for (const a of aliases) ALIAS_INDEX.set(normalizeKey(a), canonical);
  }
}

// Replace the custom-item registry with a fresh snapshot from the DB.
// Pass an array of {canonical, category, sub_category, aliases: string[]}.
function reloadCustomItems(rows) {
  CUSTOM_TAXONOMY.clear();
  CUSTOM_ALIASES.clear();
  for (const row of rows) {
    if (!row.canonical) continue;
    CUSTOM_TAXONOMY.set(row.canonical, {
      category: row.category,
      sub_category: row.sub_category,
    });
    CUSTOM_ALIASES.set(row.canonical, Array.isArray(row.aliases) ? row.aliases : []);
  }
  rebuildAliasIndex();
}

rebuildAliasIndex();

function lookupTaxonomy(canonical) {
  return TAXONOMY[canonical] || CUSTOM_TAXONOMY.get(canonical) || null;
}

function normalizeKey(s) {
  return String(s)
    .toLowerCase()
    .replace(/[_\.]+/g, ' ')
    .replace(/[^a-z0-9\s'&\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function fuzzyMatch(key) {
  if (!key || key.length < 4) return null;
  const maxEdits = key.length >= 7 ? 2 : 1;
  let best = null;
  let bestDist = Infinity;
  for (const [alias, canonical] of ALIAS_INDEX) {
    if (alias.length < 4) continue;
    if (Math.abs(alias.length - key.length) > maxEdits) continue;
    const d = levenshtein(key, alias);
    const relCap = Math.floor(Math.min(key.length, alias.length) / 4);
    if (d <= Math.min(maxEdits, relCap) && d < bestDist) {
      bestDist = d;
      best = { canonical, alias, distance: d };
      if (d === 0) break;
    }
  }
  return best;
}

const UNIT_PATTERNS = [
  { re: /^(kgs?|kilograms?|kilo)$/, unit: 'kg' },
  { re: /^(g|gm|gms|gram|grams)$/, unit: 'g' },
  { re: /^(l|lt|ltr|litre|litres|liter|liters)$/, unit: 'liter' },
  { re: /^(ml|millilitre|milliliter)$/, unit: 'ml' },
  { re: /^(pc|pcs|piece|pieces|nos|no)$/, unit: 'pcs' },
  { re: /^(dozen|doz|dz)$/, unit: 'dozen' },
  { re: /^(packet|packets|pkt|pack|packs)$/, unit: 'pack' },
];

function canonUnit(raw) {
  if (!raw) return null;
  const k = raw.toLowerCase();
  for (const { re, unit } of UNIT_PATTERNS) if (re.test(k)) return unit;
  return null;
}

function extractQuantity(input) {
  const s = String(input);
  const re = /(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const num = parseFloat(m[1].replace(',', '.'));
    if (Number.isNaN(num)) continue;
    const unit = canonUnit(m[2]);
    if (unit !== null) {
      const rest = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim();
      // Convert dozen -> pcs (1 dozen = 12).
      if (unit === 'dozen') return { quantity: num * 12, unit: 'pcs', rest };
      return { quantity: num, unit, rest };
    }
  }
  return { quantity: null, unit: null, rest: s };
}

// Strip occurrences of phrases (multi-word). Returns {stripped, hits in input order}.
function harvestPhrases(key, phrases) {
  const hits = [];
  let s = ' ' + key + ' ';
  for (const p of phrases) {
    const pat = ' ' + p + ' ';
    while (s.includes(pat)) {
      hits.push(p);
      s = s.replace(pat, ' ');
    }
  }
  return { stripped: s.trim().replace(/\s+/g, ' '), hits };
}

// Pull form / grade / variant / size hints from a leftover key.
function extractHints(key) {
  let working = key;
  const formHits = [];
  const variantHits = [];
  const gradeHits = [];
  const sizeHits = [];
  const aliasesUsed = [];

  // 1. Multi-word forms
  const mf = harvestPhrases(working, MULTI_WORD_FORMS);
  working = mf.stripped;
  for (const h of mf.hits) { formHits.push(FORM_TOKENS.get(h)); aliasesUsed.push(h); }

  // 2. Multi-word grades
  const mg = harvestPhrases(working, MULTI_WORD_GRADES);
  working = mg.stripped;
  for (const h of mg.hits) { gradeHits.push({ raw: h, ...GRADE_HINTS[h] }); aliasesUsed.push(h); }

  // 3. Multi-word variants
  const mv = harvestPhrases(working, MULTI_WORD_VARIANTS);
  working = mv.stripped;
  for (const h of mv.hits) { variantHits.push(VARIANT_TOKENS.get(h)); aliasesUsed.push(h); }

  // 4. Single-word — form > grade > size > variant precedence
  const tokens = working.split(' ').filter(Boolean);
  for (const t of tokens) {
    if (FORM_TOKENS.has(t)) {
      formHits.push(FORM_TOKENS.get(t));
      aliasesUsed.push(t);
      continue;
    }
    if (GRADE_HINTS[t]) {
      gradeHits.push({ raw: t, ...GRADE_HINTS[t] });
      aliasesUsed.push(t);
      continue;
    }
    if (SIZE_HINTS[t]) {
      sizeHits.push(SIZE_HINTS[t]);
      aliasesUsed.push(t);
      continue;
    }
    if (VARIANT_TOKENS.has(t)) {
      variantHits.push(VARIANT_TOKENS.get(t));
      aliasesUsed.push(t);
      continue;
    }
  }

  return { formHits, gradeHits, variantHits, sizeHits, aliasesUsed };
}

// Pick a grade matching the item's grading scheme.
function pickGrade(canonical, gradeHits, sizeHits) {
  const tax = canonical && lookupTaxonomy(canonical);
  const isFresh = tax && FRESH_CATEGORIES.has(tax.category);
  const isCashew = canonical === 'Cashews';

  // 1. Cashew W-code wins.
  if (isCashew) {
    const wHit = gradeHits.find(g => g.type === 'cashew');
    if (wHit) return wHit.value;
  }

  const wantType = isFresh ? 'fresh' : 'packaged';
  const match = gradeHits.find(g => g.type === wantType);
  if (match) return match.value;

  // 2. Cross-type fallback (premium on a fresh item -> Extra Class, etc.)
  if (gradeHits.length) {
    const g = gradeHits.find(x => x.type === 'packaged' || x.type === 'fresh') || gradeHits[0];
    if (isFresh) {
      if (g.value === 'Premium')  return 'Extra Class';
      if (g.value === 'Standard') return 'Class I';
      if (g.value === 'Economy')  return 'Class II';
      return g.value;
    } else {
      if (g.value === 'Extra Class') return 'Premium';
      if (g.value === 'Class I')     return 'Standard';
      if (g.value === 'Class II')    return 'Economy';
      return g.value;
    }
  }

  // 3. Size hint folds into fresh grade only.
  if (isFresh && sizeHits.length) {
    return SIZE_TO_FRESH_GRADE[sizeHits[0]] || null;
  }

  return null;
}

function lookupCanonical(key) {
  if (!key) return null;
  const tokens = key.split(' ').filter(Boolean);
  if (!tokens.length) return null;

  // 1. Longest contiguous window — exact alias.
  for (let size = tokens.length; size >= 1; size--) {
    for (let start = 0; start + size <= tokens.length; start++) {
      const win = tokens.slice(start, start + size).join(' ');
      if (ALIAS_INDEX.has(win)) {
        const leftover = [...tokens.slice(0, start), ...tokens.slice(start + size)].join(' ');
        return { canonical: ALIAS_INDEX.get(win), matched: win, leftover, fuzzy: false };
      }
    }
  }

  // 2. Fuzzy on full key.
  const fz = fuzzyMatch(key);
  if (fz) return { canonical: fz.canonical, matched: fz.alias, leftover: '', fuzzy: true };

  // 3. Fuzzy per token (must converge to one canonical).
  if (tokens.length > 1) {
    const hits = new Map();
    const matched = [];
    const usedIdx = new Set();
    for (let i = 0; i < tokens.length; i++) {
      const f = fuzzyMatch(tokens[i]);
      if (f) {
        hits.set(f.canonical, (hits.get(f.canonical) || 0) + 1);
        matched.push(f.alias);
        usedIdx.add(i);
      }
    }
    if (hits.size === 1) {
      const leftover = tokens.filter((_, i) => !usedIdx.has(i)).join(' ');
      return { canonical: [...hits.keys()][0], matched: matched.join(' '), leftover, fuzzy: true };
    }
  }

  return null;
}

function normalize(input) {
  const original = String(input ?? '');
  const { quantity, unit, rest } = extractQuantity(original);
  const namePart = (rest || original).trim();
  const key = normalizeKey(namePart);

  if (!key) {
    return {
      original,
      canonical_name: original,
      category: null,
      sub_category: null,
      form: null,
      variant: null,
      grade: null,
      aliases_matched: [],
      quantity,
      unit,
    };
  }

  const look = lookupCanonical(key);
  const leftoverKey = look ? look.leftover : key;
  const { formHits, gradeHits, variantHits, sizeHits, aliasesUsed } = extractHints(leftoverKey);

  if (!look) {
    return {
      original,
      canonical_name: original,
      category: null,
      sub_category: null,
      form: formHits.length ? [...new Set(formHits)].join(' ') : null,
      variant: variantHits.length ? [...new Set(variantHits)].join(' ') : null,
      grade: pickGrade(null, gradeHits, sizeHits),
      aliases_matched: aliasesUsed.length ? aliasesUsed : [key],
      quantity,
      unit,
    };
  }

  const tax = lookupTaxonomy(look.canonical) || { category: null, sub_category: null };
  const grade = pickGrade(look.canonical, gradeHits, sizeHits);
  const form = formHits.length ? [...new Set(formHits)].join(' ') : null;
  const variant = variantHits.length ? [...new Set(variantHits)].join(' ') : null;
  const aliases_matched = [...new Set([look.matched, ...aliasesUsed])].filter(Boolean);

  return {
    original,
    canonical_name: look.canonical,
    category: tax.category,
    sub_category: tax.sub_category,
    form,
    variant,
    grade,
    aliases_matched,
    quantity,
    unit,
  };
}

module.exports = { normalize, CANONICAL, TAXONOMY, normalizeKey, reloadCustomItems };
