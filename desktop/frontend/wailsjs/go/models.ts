export namespace domain {
	
	export class Region {
	    id: string;
	    name: string;
	    symbol: string;
	    approved: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Region(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.symbol = source["symbol"];
	        this.approved = source["approved"];
	    }
	}

}

