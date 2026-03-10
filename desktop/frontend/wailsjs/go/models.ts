export namespace models {
	
	export class GeoJSONPolygon {
	    type: string;
	    coordinates: number[][][];
	
	    static createFrom(source: any = {}) {
	        return new GeoJSONPolygon(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.coordinates = source["coordinates"];
	    }
	}
	export class Region {
	    id: string;
	    name: string;
	    symbol: string;
	    approved: boolean;
	    geometry?: GeoJSONPolygon;
	
	    static createFrom(source: any = {}) {
	        return new Region(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.symbol = source["symbol"];
	        this.approved = source["approved"];
	        this.geometry = this.convertValues(source["geometry"], GeoJSONPolygon);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

